const std = @import("std");
const objc = @import("objc.zig");

const ct = @cImport({
    @cInclude("CoreText/CoreText.h");
    @cInclude("CoreGraphics/CoreGraphics.h");
});

pub const FontConfig = struct {
    family: [*:0]const u8 = "Menlo",
    size: f32 = 14.0,
};

pub const FontVariant = enum(u2) {
    regular = 0,
    bold = 1,
    italic = 2,
    bold_italic = 3,
};

pub const GlyphInfo = struct {
    // UV coordinates in the atlas texture (0..1)
    u0: f32,
    v0: f32,
    u1: f32,
    v1: f32,
    // Glyph metrics in pixels
    width: f32,
    height: f32,
    bearing_x: f32,
    bearing_y: f32,
    advance: f32,
};

const MTLRegion = extern struct {
    origin_x: u64,
    origin_y: u64,
    origin_z: u64,
    size_w: u64,
    size_h: u64,
    size_d: u64,
};

pub const GlyphKey = packed struct {
    codepoint: u21,
    variant: FontVariant,
    _pad: u9 = 0,
};

pub const Atlas = struct {
    texture: objc.id = null,
    width: u32 = 2048,
    height: u32 = 2048,
    ascii_glyphs: [4][128]GlyphInfo = undefined,
    cell_width: f32 = 0,
    cell_height: f32 = 0,
    font_ascent: f32 = 0,
    font_descent: f32 = 0,
    scale: f32 = 1.0,

    // Dynamic glyph cache for non-ASCII (keyed by codepoint + variant)
    unicode_glyphs: std.AutoHashMap(GlyphKey, GlyphInfo),
    allocator: std.mem.Allocator,

    // Atlas packing state
    next_x: u32 = 0,
    next_y: u32 = 0,
    row_height: u32 = 0,
    glyph_w: u32 = 0,
    glyph_h: u32 = 0,

    // Eviction
    generation: u32 = 0,

    // Retained resources for on-demand rasterization
    fonts: [4]ct.CTFontRef = .{ null, null, null, null },
    color_space: ct.CGColorSpaceRef = null,
    device: objc.id = null,
    raster_buf: []u8 = &.{},

    pub fn init(allocator: std.mem.Allocator, device: objc.id, config: FontConfig, scale: f32) !Atlas {
        var self = Atlas{
            .unicode_glyphs = std.AutoHashMap(GlyphKey, GlyphInfo).init(allocator),
            .allocator = allocator,
        };
        self.scale = scale;
        self.device = device;

        const render_size = config.size * scale;

        // Create base CTFont from config
        const font_name = ct.CFStringCreateWithCString(null, config.family, ct.kCFStringEncodingUTF8);
        defer ct.CFRelease(font_name);

        const base_font = ct.CTFontCreateWithName(font_name, render_size, null);
        self.fonts[@intFromEnum(FontVariant.regular)] = base_font;

        // Derive bold/italic/bold_italic variants
        const kCTFontBoldTrait: u32 = 2;
        const kCTFontItalicTrait: u32 = 1;
        const trait_masks = [3]u32{ kCTFontBoldTrait, kCTFontItalicTrait, kCTFontBoldTrait | kCTFontItalicTrait };
        const variant_indices = [3]usize{ @intFromEnum(FontVariant.bold), @intFromEnum(FontVariant.italic), @intFromEnum(FontVariant.bold_italic) };

        for (trait_masks, variant_indices) |traits, vi| {
            const derived = ct.CTFontCreateCopyWithSymbolicTraits(base_font, 0.0, null, traits, traits);
            if (derived != null) {
                self.fonts[vi] = derived;
            } else {
                // Fallback: retain base font for this slot
                _ = ct.CFRetain(base_font);
                self.fonts[vi] = base_font;
            }
        }

        // Get font metrics from regular variant
        self.font_ascent = @floatCast(ct.CTFontGetAscent(base_font));
        self.font_descent = @floatCast(ct.CTFontGetDescent(base_font));
        const leading: f32 = @floatCast(ct.CTFontGetLeading(base_font));
        self.cell_height = @ceil(self.font_ascent + self.font_descent + leading);

        // Get cell width from space advance
        var space_glyph: ct.CGGlyph = 0;
        var space_char: ct.UniChar = ' ';
        _ = ct.CTFontGetGlyphsForCharacters(base_font, &space_char, &space_glyph, 1);
        var advance: ct.CGSize = .{ .width = 0, .height = 0 };
        _ = ct.CTFontGetAdvancesForGlyphs(base_font, ct.kCTFontOrientationHorizontal, &space_glyph, &advance, 1);
        self.cell_width = @ceil(@as(f32, @floatCast(advance.width)));

        self.glyph_w = @intFromFloat(@ceil(self.cell_width) + 4);
        self.glyph_h = @intFromFloat(@ceil(self.cell_height) + 4);

        // Allocate persistent glyph bitmap buffer
        const bmp_w = self.glyph_w;
        const bmp_h = self.glyph_h;
        const row_bytes = bmp_w * 4;
        self.raster_buf = try allocator.alloc(u8, @as(usize, row_bytes) * @as(usize, bmp_h));
        self.color_space = ct.CGColorSpaceCreateDeviceRGB();

        // Create atlas pixel buffer
        const atlas_pixels = try std.heap.page_allocator.alloc(u8, @as(usize, self.width) * @as(usize, self.height) * 4);
        defer std.heap.page_allocator.free(atlas_pixels);
        @memset(atlas_pixels, 0);

        // Rasterize ASCII 32..126 for all 4 font variants
        const glyphs_per_row = self.width / self.glyph_w;
        const ascii_count: u32 = 95; // 32..126
        const ascii_rows_per_variant = (ascii_count + glyphs_per_row - 1) / glyphs_per_row;

        for (0..4) |vi| {
            const font = self.fonts[vi];
            const variant_base_y = @as(u32, @intCast(vi)) * ascii_rows_per_variant * self.glyph_h;

            for (32..127) |i| {
                var uni_char: ct.UniChar = @intCast(i);
                var glyph: ct.CGGlyph = 0;
                _ = ct.CTFontGetGlyphsForCharacters(font, &uni_char, &glyph, 1);

                var bbox: ct.CGRect = .{ .origin = .{ .x = 0, .y = 0 }, .size = .{ .width = 0, .height = 0 } };
                _ = ct.CTFontGetBoundingRectsForGlyphs(font, ct.kCTFontOrientationHorizontal, &glyph, &bbox, 1);

                var glyph_advance: ct.CGSize = .{ .width = 0, .height = 0 };
                _ = ct.CTFontGetAdvancesForGlyphs(font, ct.kCTFontOrientationHorizontal, &glyph, &glyph_advance, 1);

                const idx = i - 32;
                const atlas_x = @as(u32, @intCast(idx % glyphs_per_row)) * self.glyph_w;
                const atlas_y = variant_base_y + @as(u32, @intCast(idx / glyphs_per_row)) * self.glyph_h;

                @memset(self.raster_buf, 0);

                const ctx = ct.CGBitmapContextCreate(self.raster_buf.ptr, bmp_w, bmp_h, 8, row_bytes, self.color_space, ct.kCGImageAlphaPremultipliedLast);
                if (ctx == null) continue;
                defer ct.CGContextRelease(ctx);

                ct.CGContextSetRGBFillColor(ctx, 1.0, 1.0, 1.0, 1.0);
                const draw_x: ct.CGFloat = 2.0 - bbox.origin.x;
                const draw_y: ct.CGFloat = 2.0 + self.font_descent;
                var position = ct.CGPoint{ .x = draw_x, .y = draw_y };
                ct.CTFontDrawGlyphs(font, &glyph, &position, 1, ctx);

                for (0..bmp_h) |row| {
                    const dst_y = atlas_y + @as(u32, @intCast(row));
                    if (dst_y >= self.height) break;
                    const src_offset = row * row_bytes;
                    const dst_offset = @as(usize, dst_y) * @as(usize, self.width) * 4 + @as(usize, atlas_x) * 4;
                    const copy_bytes = @min(@as(usize, bmp_w) * 4, @as(usize, self.width) * 4 - @as(usize, atlas_x) * 4);
                    @memcpy(atlas_pixels[dst_offset .. dst_offset + copy_bytes], self.raster_buf[src_offset .. src_offset + copy_bytes]);
                }

                self.ascii_glyphs[vi][i] = .{
                    .u0 = @as(f32, @floatFromInt(atlas_x)) / @as(f32, @floatFromInt(self.width)),
                    .v0 = @as(f32, @floatFromInt(atlas_y)) / @as(f32, @floatFromInt(self.height)),
                    .u1 = @as(f32, @floatFromInt(atlas_x + bmp_w)) / @as(f32, @floatFromInt(self.width)),
                    .v1 = @as(f32, @floatFromInt(atlas_y + bmp_h)) / @as(f32, @floatFromInt(self.height)),
                    .width = @floatFromInt(bmp_w),
                    .height = @floatFromInt(bmp_h),
                    .bearing_x = @floatCast(bbox.origin.x),
                    .bearing_y = @floatCast(bbox.origin.y),
                    .advance = @floatCast(glyph_advance.width),
                };
            }

            // Fill non-printable defaults
            for (0..32) |i| {
                self.ascii_glyphs[vi][i] = self.ascii_glyphs[vi][' '];
            }
            self.ascii_glyphs[vi][127] = self.ascii_glyphs[vi][' '];
        }

        // Set packing cursor past all ASCII glyph regions (4 variants)
        self.next_x = 0;
        self.next_y = 4 * ascii_rows_per_variant * self.glyph_h;
        self.row_height = self.glyph_h;

        // Create Metal texture
        const descriptor = objc.msgSend(objc.id, @as(objc.id, @ptrCast(objc.getClass("MTLTextureDescriptor"))), objc.sel("texture2DDescriptorWithPixelFormat:width:height:mipmapped:"), .{
            @as(u64, 70), // MTLPixelFormatRGBA8Unorm
            @as(u64, self.width),
            @as(u64, self.height),
            objc.NO,
        });

        self.texture = objc.msgSend(objc.id, device, objc.sel("newTextureWithDescriptor:"), .{descriptor});

        const region = MTLRegion{
            .origin_x = 0,
            .origin_y = 0,
            .origin_z = 0,
            .size_w = self.width,
            .size_h = self.height,
            .size_d = 1,
        };

        objc.msgSendVoid(self.texture, objc.sel("replaceRegion:mipmapLevel:withBytes:bytesPerRow:"), .{
            region,
            @as(u64, 0),
            @as(*const anyopaque, atlas_pixels.ptr),
            @as(u64, self.width * 4),
        });

        return self;
    }

    pub fn deinit(self: *Atlas) void {
        self.unicode_glyphs.deinit();
        if (self.raster_buf.len > 0) {
            self.allocator.free(self.raster_buf);
        }
        for (&self.fonts) |f| {
            if (f != null) ct.CFRelease(f);
        }
        if (self.color_space != null) ct.CGColorSpaceRelease(self.color_space);
    }

    fn rasterizeGlyph(self: *Atlas, codepoint: u21, variant: FontVariant) ?GlyphInfo {
        const font = self.fonts[@intFromEnum(variant)];

        // Encode codepoint to UTF-16 for CoreText
        var unichars: [2]ct.UniChar = undefined;
        var unichar_count: usize = 1;
        if (codepoint <= 0xFFFF) {
            unichars[0] = @intCast(codepoint);
        } else {
            const cp = codepoint - 0x10000;
            unichars[0] = @intCast(0xD800 + (cp >> 10));
            unichars[1] = @intCast(0xDC00 + (cp & 0x3FF));
            unichar_count = 2;
        }

        // Check if primary font has the glyph; if not, get a fallback font
        var glyphs_out: [2]ct.CGGlyph = .{ 0, 0 };
        const has_glyph = ct.CTFontGetGlyphsForCharacters(font, &unichars, &glyphs_out, @intCast(unichar_count));
        var render_font = font;
        var owns_render_font = false;
        if (!has_glyph or glyphs_out[0] == 0) {
            // Try font fallback via CTFontCreateForString
            const cf_str = ct.CFStringCreateWithCharacters(null, &unichars, @intCast(unichar_count));
            if (cf_str == null) return null;
            defer ct.CFRelease(cf_str);
            const fallback = ct.CTFontCreateForString(font, cf_str, ct.CFRangeMake(0, @intCast(unichar_count)));
            if (fallback == null) return null;
            render_font = fallback;
            owns_render_font = true;
        }
        defer if (owns_render_font) ct.CFRelease(render_font);

        // Use CTLine for rendering
        const cf_str = ct.CFStringCreateWithCharacters(null, &unichars, @intCast(unichar_count));
        if (cf_str == null) return null;
        defer ct.CFRelease(cf_str);

        const attr_str = ct.CFAttributedStringCreateMutable(null, 0);
        if (attr_str == null) return null;
        defer ct.CFRelease(attr_str);

        ct.CFAttributedStringReplaceString(attr_str, ct.CFRangeMake(0, 0), cf_str);
        const str_len = ct.CFAttributedStringGetLength(attr_str);
        const full_range = ct.CFRangeMake(0, str_len);

        // Set font attribute
        const font_attr_key = ct.kCTFontAttributeName;
        ct.CFAttributedStringSetAttribute(attr_str, full_range, font_attr_key, render_font);

        // Use context color (white) for drawing
        const fg_from_ctx_key = ct.kCTForegroundColorFromContextAttributeName;
        ct.CFAttributedStringSetAttribute(attr_str, full_range, fg_from_ctx_key, ct.kCFBooleanTrue);

        const line = ct.CTLineCreateWithAttributedString(@ptrCast(attr_str));
        if (line == null) return null;
        defer ct.CFRelease(line);

        // Get typographic bounds
        var ascent_d: ct.CGFloat = 0;
        var descent_d: ct.CGFloat = 0;
        var leading_d: ct.CGFloat = 0;
        const line_width = ct.CTLineGetTypographicBounds(line, &ascent_d, &descent_d, &leading_d);

        const bmp_w = self.glyph_w;
        const bmp_h = self.glyph_h;
        const row_bytes = bmp_w * 4;

        // Allocate atlas space (with eviction retry)
        if (self.next_x + bmp_w > self.width) {
            self.next_x = 0;
            self.next_y += self.row_height;
        }
        if (self.next_y + bmp_h > self.height) {
            self.evictAndReset();
            // Retry after eviction
            if (self.next_x + bmp_w > self.width) {
                self.next_x = 0;
                self.next_y += self.row_height;
            }
            if (self.next_y + bmp_h > self.height) {
                return null; // Still full after eviction
            }
        }

        const atlas_x = self.next_x;
        const atlas_y = self.next_y;

        // Rasterize via CTLineDraw
        @memset(self.raster_buf, 0);

        const ctx = ct.CGBitmapContextCreate(self.raster_buf.ptr, bmp_w, bmp_h, 8, row_bytes, self.color_space, ct.kCGImageAlphaPremultipliedLast);
        if (ctx == null) return null;
        defer ct.CGContextRelease(ctx);

        ct.CGContextSetRGBFillColor(ctx, 1.0, 1.0, 1.0, 1.0);
        ct.CGContextSetTextPosition(ctx, 2.0, 2.0 + self.font_descent);
        ct.CTLineDraw(line, ctx);

        // Upload to atlas texture
        const region = MTLRegion{
            .origin_x = atlas_x,
            .origin_y = atlas_y,
            .origin_z = 0,
            .size_w = bmp_w,
            .size_h = bmp_h,
            .size_d = 1,
        };

        objc.msgSendVoid(self.texture, objc.sel("replaceRegion:mipmapLevel:withBytes:bytesPerRow:"), .{
            region,
            @as(u64, 0),
            @as(*const anyopaque, self.raster_buf.ptr),
            @as(u64, row_bytes),
        });

        const info = GlyphInfo{
            .u0 = @as(f32, @floatFromInt(atlas_x)) / @as(f32, @floatFromInt(self.width)),
            .v0 = @as(f32, @floatFromInt(atlas_y)) / @as(f32, @floatFromInt(self.height)),
            .u1 = @as(f32, @floatFromInt(atlas_x + bmp_w)) / @as(f32, @floatFromInt(self.width)),
            .v1 = @as(f32, @floatFromInt(atlas_y + bmp_h)) / @as(f32, @floatFromInt(self.height)),
            .width = @floatFromInt(bmp_w),
            .height = @floatFromInt(bmp_h),
            .bearing_x = 0,
            .bearing_y = 0,
            .advance = @floatCast(@as(f32, @floatCast(line_width))),
        };

        const key = GlyphKey{ .codepoint = codepoint, .variant = variant };
        self.unicode_glyphs.put(key, info) catch {};
        self.next_x += bmp_w;

        return info;
    }

    // --- Procedural Box Drawing ---

    const BoxSeg = enum { none, light, heavy };

    const BoxParts = struct {
        left: BoxSeg = .none,
        right: BoxSeg = .none,
        up: BoxSeg = .none,
        down: BoxSeg = .none,
    };

    fn getBoxParts(cp: u21) ?BoxParts {
        return switch (cp) {
            // Light lines
            0x2500 => .{ .left = .light, .right = .light }, // ─
            0x2502 => .{ .up = .light, .down = .light }, // │
            // Heavy lines
            0x2501 => .{ .left = .heavy, .right = .heavy }, // ━
            0x2503 => .{ .up = .heavy, .down = .heavy }, // ┃
            // Light corners
            0x250C => .{ .right = .light, .down = .light }, // ┌
            0x2510 => .{ .left = .light, .down = .light }, // ┐
            0x2514 => .{ .right = .light, .up = .light }, // └
            0x2518 => .{ .left = .light, .up = .light }, // ┘
            // Heavy corners
            0x250F => .{ .right = .heavy, .down = .heavy }, // ┏
            0x2513 => .{ .left = .heavy, .down = .heavy }, // ┓
            0x2517 => .{ .right = .heavy, .up = .heavy }, // ┗
            0x251B => .{ .left = .heavy, .up = .heavy }, // ┛
            // Mixed corners
            0x250D => .{ .right = .heavy, .down = .light }, // ┍
            0x250E => .{ .right = .light, .down = .heavy }, // ┎
            0x2511 => .{ .left = .heavy, .down = .light }, // ┑
            0x2512 => .{ .left = .light, .down = .heavy }, // ┒
            0x2515 => .{ .right = .heavy, .up = .light }, // ┕
            0x2516 => .{ .right = .light, .up = .heavy }, // ┖
            0x2519 => .{ .left = .heavy, .up = .light }, // ┙
            0x251A => .{ .left = .light, .up = .heavy }, // ┚
            // Light tees
            0x251C => .{ .up = .light, .down = .light, .right = .light }, // ├
            0x2524 => .{ .up = .light, .down = .light, .left = .light }, // ┤
            0x252C => .{ .left = .light, .right = .light, .down = .light }, // ┬
            0x2534 => .{ .left = .light, .right = .light, .up = .light }, // ┴
            // Heavy tees
            0x2523 => .{ .up = .heavy, .down = .heavy, .right = .heavy }, // ┣
            0x252B => .{ .up = .heavy, .down = .heavy, .left = .heavy }, // ┫
            0x2533 => .{ .left = .heavy, .right = .heavy, .down = .heavy }, // ┳
            0x253B => .{ .left = .heavy, .right = .heavy, .up = .heavy }, // ┻
            // Mixed tees
            0x251D => .{ .up = .light, .down = .light, .right = .heavy },
            0x2520 => .{ .up = .heavy, .down = .heavy, .right = .light },
            0x2525 => .{ .up = .light, .down = .light, .left = .heavy },
            0x2528 => .{ .up = .heavy, .down = .heavy, .left = .light },
            0x252F => .{ .left = .heavy, .right = .heavy, .down = .light },
            0x2530 => .{ .left = .light, .right = .light, .down = .heavy },
            0x2537 => .{ .left = .heavy, .right = .heavy, .up = .light },
            0x2538 => .{ .left = .light, .right = .light, .up = .heavy },
            // Crosses
            0x253C => .{ .left = .light, .right = .light, .up = .light, .down = .light }, // ┼
            0x254B => .{ .left = .heavy, .right = .heavy, .up = .heavy, .down = .heavy }, // ╋
            // Rounded corners (render as light straight)
            0x256D => .{ .right = .light, .down = .light }, // ╭
            0x256E => .{ .left = .light, .down = .light }, // ╮
            0x256F => .{ .left = .light, .up = .light }, // ╯
            0x2570 => .{ .right = .light, .up = .light }, // ╰
            // Half lines
            0x2574 => .{ .left = .light }, // ╴
            0x2575 => .{ .up = .light }, // ╵
            0x2576 => .{ .right = .light }, // ╶
            0x2577 => .{ .down = .light }, // ╷
            0x2578 => .{ .left = .heavy }, // ╸
            0x2579 => .{ .up = .heavy }, // ╹
            0x257A => .{ .right = .heavy }, // ╺
            0x257B => .{ .down = .heavy }, // ╻
            0x257C => .{ .left = .light, .right = .heavy }, // ╼
            0x257D => .{ .up = .light, .down = .heavy }, // ╽
            0x257E => .{ .left = .heavy, .right = .light }, // ╾
            0x257F => .{ .up = .heavy, .down = .light }, // ╿
            else => null,
        };
    }

    fn boxFillRect(buf: []u8, pitch: u32, x0: u32, y0: u32, x1: u32, y1: u32) void {
        var y = y0;
        while (y < y1) : (y += 1) {
            var x = x0;
            while (x < x1) : (x += 1) {
                const off = @as(usize, y) * @as(usize, pitch) + @as(usize, x) * 4;
                buf[off] = 255;
                buf[off + 1] = 255;
                buf[off + 2] = 255;
                buf[off + 3] = 255;
            }
        }
    }

    fn rasterizeBoxDrawing(self: *Atlas, codepoint: u21) ?GlyphInfo {
        // First check if it's a block element (simple filled rectangles)
        const cell_w = self.glyph_w - 4;
        const cell_h = self.glyph_h - 4;
        const pitch = cell_w * 4;
        const buf_size = @as(usize, pitch) * @as(usize, cell_h);

        @memset(self.raster_buf[0..buf_size], 0);

        var handled = false;

        // Block elements (U+2580-U+2590), shades (U+2591-U+2593),
        // extra blocks (U+2594-U+2595), and quadrants (U+2596-U+259F)
        if (codepoint >= 0x2580 and codepoint <= 0x259F) {
            const half_w = cell_w / 2;
            const half_h = cell_h / 2;
            handled = true;
            switch (codepoint) {
                0x2580 => boxFillRect(self.raster_buf, pitch, 0, 0, cell_w, half_h), // ▀
                0x2581 => boxFillRect(self.raster_buf, pitch, 0, cell_h * 7 / 8, cell_w, cell_h), // ▁
                0x2582 => boxFillRect(self.raster_buf, pitch, 0, cell_h * 3 / 4, cell_w, cell_h), // ▂
                0x2583 => boxFillRect(self.raster_buf, pitch, 0, cell_h * 5 / 8, cell_w, cell_h), // ▃
                0x2584 => boxFillRect(self.raster_buf, pitch, 0, half_h, cell_w, cell_h), // ▄
                0x2585 => boxFillRect(self.raster_buf, pitch, 0, cell_h * 3 / 8, cell_w, cell_h), // ▅
                0x2586 => boxFillRect(self.raster_buf, pitch, 0, cell_h / 4, cell_w, cell_h), // ▆
                0x2587 => boxFillRect(self.raster_buf, pitch, 0, cell_h / 8, cell_w, cell_h), // ▇
                0x2588 => boxFillRect(self.raster_buf, pitch, 0, 0, cell_w, cell_h), // █
                0x2589 => boxFillRect(self.raster_buf, pitch, 0, 0, cell_w * 7 / 8, cell_h), // ▉
                0x258A => boxFillRect(self.raster_buf, pitch, 0, 0, cell_w * 3 / 4, cell_h), // ▊
                0x258B => boxFillRect(self.raster_buf, pitch, 0, 0, cell_w * 5 / 8, cell_h), // ▋
                0x258C => boxFillRect(self.raster_buf, pitch, 0, 0, half_w, cell_h), // ▌
                0x258D => boxFillRect(self.raster_buf, pitch, 0, 0, cell_w * 3 / 8, cell_h), // ▍
                0x258E => boxFillRect(self.raster_buf, pitch, 0, 0, cell_w / 4, cell_h), // ▎
                0x258F => boxFillRect(self.raster_buf, pitch, 0, 0, cell_w / 8, cell_h), // ▏
                0x2590 => boxFillRect(self.raster_buf, pitch, half_w, 0, cell_w, cell_h), // ▐
                // Shade characters (approximate with dithering not practical; use partial fill)
                0x2591 => boxFillRect(self.raster_buf, pitch, 0, 0, cell_w / 4, cell_h), // ░ light shade
                0x2592 => boxFillRect(self.raster_buf, pitch, 0, 0, half_w, cell_h), // ▒ medium shade
                0x2593 => boxFillRect(self.raster_buf, pitch, 0, 0, cell_w * 3 / 4, cell_h), // ▓ dark shade
                // Extra blocks
                0x2594 => boxFillRect(self.raster_buf, pitch, 0, 0, cell_w, cell_h / 8), // ▔ upper 1/8
                0x2595 => boxFillRect(self.raster_buf, pitch, cell_w * 7 / 8, 0, cell_w, cell_h), // ▕ right 1/8
                // Quadrant characters
                0x2596 => { // ▖ lower left
                    boxFillRect(self.raster_buf, pitch, 0, half_h, half_w, cell_h);
                },
                0x2597 => { // ▗ lower right
                    boxFillRect(self.raster_buf, pitch, half_w, half_h, cell_w, cell_h);
                },
                0x2598 => { // ▘ upper left
                    boxFillRect(self.raster_buf, pitch, 0, 0, half_w, half_h);
                },
                0x2599 => { // ▙ UL + LL + LR
                    boxFillRect(self.raster_buf, pitch, 0, 0, half_w, cell_h);
                    boxFillRect(self.raster_buf, pitch, half_w, half_h, cell_w, cell_h);
                },
                0x259A => { // ▚ UL + LR
                    boxFillRect(self.raster_buf, pitch, 0, 0, half_w, half_h);
                    boxFillRect(self.raster_buf, pitch, half_w, half_h, cell_w, cell_h);
                },
                0x259B => { // ▛ UL + UR + LL
                    boxFillRect(self.raster_buf, pitch, 0, 0, cell_w, half_h);
                    boxFillRect(self.raster_buf, pitch, 0, half_h, half_w, cell_h);
                },
                0x259C => { // ▜ UL + UR + LR
                    boxFillRect(self.raster_buf, pitch, 0, 0, cell_w, half_h);
                    boxFillRect(self.raster_buf, pitch, half_w, half_h, cell_w, cell_h);
                },
                0x259D => { // ▝ upper right
                    boxFillRect(self.raster_buf, pitch, half_w, 0, cell_w, half_h);
                },
                0x259E => { // ▞ UR + LL
                    boxFillRect(self.raster_buf, pitch, half_w, 0, cell_w, half_h);
                    boxFillRect(self.raster_buf, pitch, 0, half_h, half_w, cell_h);
                },
                0x259F => { // ▟ UR + LL + LR
                    boxFillRect(self.raster_buf, pitch, 0, half_h, cell_w, cell_h);
                    boxFillRect(self.raster_buf, pitch, half_w, 0, cell_w, half_h);
                },
                else => {
                    handled = false;
                },
            }
        }

        // Box-drawing lines (U+2500-U+257F)
        if (!handled) {
            const parts = getBoxParts(codepoint) orelse return null;

            const mid_x = cell_w / 2;
            const mid_y = cell_h / 2;
            const light_t: u32 = @max(1, @as(u32, @intFromFloat(@ceil(self.scale))));
            const heavy_t: u32 = light_t * 3;

            // Left segment
            if (parts.left != .none) {
                const t = if (parts.left == .heavy) heavy_t else light_t;
                const ht = t / 2;
                boxFillRect(self.raster_buf, pitch, 0, mid_y -| ht, mid_x + t - ht, @min(mid_y -| ht + t, cell_h));
            }
            // Right segment
            if (parts.right != .none) {
                const t = if (parts.right == .heavy) heavy_t else light_t;
                const ht = t / 2;
                boxFillRect(self.raster_buf, pitch, mid_x -| ht, mid_y -| ht, cell_w, @min(mid_y -| ht + t, cell_h));
            }
            // Up segment
            if (parts.up != .none) {
                const t = if (parts.up == .heavy) heavy_t else light_t;
                const ht = t / 2;
                boxFillRect(self.raster_buf, pitch, mid_x -| ht, 0, @min(mid_x -| ht + t, cell_w), mid_y + t - ht);
            }
            // Down segment
            if (parts.down != .none) {
                const t = if (parts.down == .heavy) heavy_t else light_t;
                const ht = t / 2;
                boxFillRect(self.raster_buf, pitch, mid_x -| ht, mid_y -| ht, @min(mid_x -| ht + t, cell_w), cell_h);
            }
        }

        // Pack into atlas (with eviction retry)
        if (self.next_x + self.glyph_w > self.width) {
            self.next_x = 0;
            self.next_y += self.row_height;
        }
        if (self.next_y + self.glyph_h > self.height) {
            self.evictAndReset();
            if (self.next_x + self.glyph_w > self.width) {
                self.next_x = 0;
                self.next_y += self.row_height;
            }
            if (self.next_y + self.glyph_h > self.height) {
                return null;
            }
        }

        const atlas_x = self.next_x;
        const atlas_y = self.next_y;

        // Upload cell-sized region to atlas texture
        const region = MTLRegion{
            .origin_x = atlas_x,
            .origin_y = atlas_y,
            .origin_z = 0,
            .size_w = cell_w,
            .size_h = cell_h,
            .size_d = 1,
        };

        objc.msgSendVoid(self.texture, objc.sel("replaceRegion:mipmapLevel:withBytes:bytesPerRow:"), .{
            region,
            @as(u64, 0),
            @as(*const anyopaque, self.raster_buf.ptr),
            @as(u64, pitch),
        });

        const info = GlyphInfo{
            .u0 = @as(f32, @floatFromInt(atlas_x)) / @as(f32, @floatFromInt(self.width)),
            .v0 = @as(f32, @floatFromInt(atlas_y)) / @as(f32, @floatFromInt(self.height)),
            .u1 = @as(f32, @floatFromInt(atlas_x + cell_w)) / @as(f32, @floatFromInt(self.width)),
            .v1 = @as(f32, @floatFromInt(atlas_y + cell_h)) / @as(f32, @floatFromInt(self.height)),
            .width = @floatFromInt(cell_w),
            .height = @floatFromInt(cell_h),
            .bearing_x = 0,
            .bearing_y = 0,
            .advance = @floatFromInt(cell_w),
        };

        // Box drawing always uses regular variant for cache key
        const key = GlyphKey{ .codepoint = codepoint, .variant = .regular };
        self.unicode_glyphs.put(key, info) catch {};
        self.next_x += self.glyph_w;

        return info;
    }

    pub fn getGlyph(self: *Atlas, char: u21, variant: FontVariant) GlyphInfo {
        if (char < 128) {
            return self.ascii_glyphs[@intFromEnum(variant)][@intCast(char)];
        }
        // Check cache (box drawing always uses regular variant)
        const cache_variant = if (char >= 0x2500 and char <= 0x259F) FontVariant.regular else variant;
        const key = GlyphKey{ .codepoint = char, .variant = cache_variant };
        if (self.unicode_glyphs.get(key)) |info| {
            return info;
        }
        // For box-drawing, block elements, and quadrants, use procedural rendering
        if (char >= 0x2500 and char <= 0x259F) {
            if (self.rasterizeBoxDrawing(char)) |info| {
                return info;
            }
        }
        // Cache miss — rasterize from font on demand
        if (self.rasterizeGlyph(char, variant)) |info| {
            return info;
        }
        // Fallback to space
        return self.ascii_glyphs[@intFromEnum(variant)][' '];
    }

    fn evictAndReset(self: *Atlas) void {
        self.generation += 1;
        self.unicode_glyphs.clearRetainingCapacity();

        // Re-rasterize all 4 variants of ASCII into the atlas texture
        const glyphs_per_row = self.width / self.glyph_w;
        const ascii_count: u32 = 95;
        const ascii_rows_per_variant = (ascii_count + glyphs_per_row - 1) / glyphs_per_row;
        const bmp_w = self.glyph_w;
        const bmp_h = self.glyph_h;
        const row_bytes = bmp_w * 4;

        for (0..4) |vi| {
            const font = self.fonts[vi];
            const variant_base_y = @as(u32, @intCast(vi)) * ascii_rows_per_variant * self.glyph_h;

            for (32..127) |i| {
                var uni_char: ct.UniChar = @intCast(i);
                var glyph: ct.CGGlyph = 0;
                _ = ct.CTFontGetGlyphsForCharacters(font, &uni_char, &glyph, 1);

                var bbox: ct.CGRect = .{ .origin = .{ .x = 0, .y = 0 }, .size = .{ .width = 0, .height = 0 } };
                _ = ct.CTFontGetBoundingRectsForGlyphs(font, ct.kCTFontOrientationHorizontal, &glyph, &bbox, 1);

                var glyph_advance: ct.CGSize = .{ .width = 0, .height = 0 };
                _ = ct.CTFontGetAdvancesForGlyphs(font, ct.kCTFontOrientationHorizontal, &glyph, &glyph_advance, 1);

                const idx = i - 32;
                const atlas_x = @as(u32, @intCast(idx % glyphs_per_row)) * self.glyph_w;
                const atlas_y = variant_base_y + @as(u32, @intCast(idx / glyphs_per_row)) * self.glyph_h;

                @memset(self.raster_buf, 0);

                const ctx = ct.CGBitmapContextCreate(self.raster_buf.ptr, bmp_w, bmp_h, 8, row_bytes, self.color_space, ct.kCGImageAlphaPremultipliedLast);
                if (ctx == null) continue;
                defer ct.CGContextRelease(ctx);

                ct.CGContextSetRGBFillColor(ctx, 1.0, 1.0, 1.0, 1.0);
                const draw_x: ct.CGFloat = 2.0 - bbox.origin.x;
                const draw_y: ct.CGFloat = 2.0 + self.font_descent;
                var position = ct.CGPoint{ .x = draw_x, .y = draw_y };
                ct.CTFontDrawGlyphs(font, &glyph, &position, 1, ctx);

                const region = MTLRegion{
                    .origin_x = atlas_x,
                    .origin_y = atlas_y,
                    .origin_z = 0,
                    .size_w = bmp_w,
                    .size_h = bmp_h,
                    .size_d = 1,
                };

                objc.msgSendVoid(self.texture, objc.sel("replaceRegion:mipmapLevel:withBytes:bytesPerRow:"), .{
                    region,
                    @as(u64, 0),
                    @as(*const anyopaque, self.raster_buf.ptr),
                    @as(u64, row_bytes),
                });

                self.ascii_glyphs[vi][i] = .{
                    .u0 = @as(f32, @floatFromInt(atlas_x)) / @as(f32, @floatFromInt(self.width)),
                    .v0 = @as(f32, @floatFromInt(atlas_y)) / @as(f32, @floatFromInt(self.height)),
                    .u1 = @as(f32, @floatFromInt(atlas_x + bmp_w)) / @as(f32, @floatFromInt(self.width)),
                    .v1 = @as(f32, @floatFromInt(atlas_y + bmp_h)) / @as(f32, @floatFromInt(self.height)),
                    .width = @floatFromInt(bmp_w),
                    .height = @floatFromInt(bmp_h),
                    .bearing_x = @floatCast(bbox.origin.x),
                    .bearing_y = @floatCast(bbox.origin.y),
                    .advance = @floatCast(glyph_advance.width),
                };
            }

            for (0..32) |i| {
                self.ascii_glyphs[vi][i] = self.ascii_glyphs[vi][' '];
            }
            self.ascii_glyphs[vi][127] = self.ascii_glyphs[vi][' '];
        }

        // Reset packing cursor past ASCII
        self.next_x = 0;
        self.next_y = 4 * ascii_rows_per_variant * self.glyph_h;
        self.row_height = self.glyph_h;
    }
};
