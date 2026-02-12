const std = @import("std");
const objc = @import("objc.zig");

const ct = @cImport({
    @cInclude("CoreText/CoreText.h");
    @cInclude("CoreGraphics/CoreGraphics.h");
});

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

pub const Atlas = struct {
    texture: objc.id = null,
    width: u32 = 2048,
    height: u32 = 2048,
    glyphs: [128]GlyphInfo = undefined,
    cell_width: f32 = 0,
    cell_height: f32 = 0,
    font_ascent: f32 = 0,
    font_descent: f32 = 0,
    scale: f32 = 1.0,

    pub fn init(device: objc.id, font_size: f32, scale: f32) !Atlas {
        var self = Atlas{};
        self.scale = scale;

        // Rasterize at scaled size for Retina
        const render_size = font_size * scale;

        // Create CTFont for Menlo
        const font_name = ct.CFStringCreateWithCString(
            null,
            "Menlo",
            ct.kCFStringEncodingUTF8,
        );
        defer ct.CFRelease(font_name);

        const font = ct.CTFontCreateWithName(font_name, render_size, null);
        defer ct.CFRelease(font);

        // Get font metrics
        self.font_ascent = @floatCast(ct.CTFontGetAscent(font));
        self.font_descent = @floatCast(ct.CTFontGetDescent(font));
        const leading: f32 = @floatCast(ct.CTFontGetLeading(font));

        self.cell_height = @ceil(self.font_ascent + self.font_descent + leading);

        // Get advance width for a space character to determine cell width
        var space_glyph: ct.CGGlyph = 0;
        var space_char: ct.UniChar = ' ';
        _ = ct.CTFontGetGlyphsForCharacters(font, &space_char, &space_glyph, 1);
        var advance: ct.CGSize = .{ .width = 0, .height = 0 };
        _ = ct.CTFontGetAdvancesForGlyphs(font, ct.kCTFontOrientationHorizontal, &space_glyph, &advance, 1);
        self.cell_width = @ceil(@as(f32, @floatCast(advance.width)));

        // Create bitmap context for rasterization
        const glyph_w: u32 = @intFromFloat(@ceil(self.cell_width) + 4);
        const glyph_h: u32 = @intFromFloat(@ceil(self.cell_height) + 4);

        // Calculate atlas layout
        const glyphs_per_row = self.width / glyph_w;

        // Create atlas pixel buffer
        const atlas_pixels = try std.heap.page_allocator.alloc(u8, @as(usize, self.width) * @as(usize, self.height) * 4);
        defer std.heap.page_allocator.free(atlas_pixels);
        @memset(atlas_pixels, 0);

        // Allocate glyph bitmap buffer once, reuse for each glyph
        const bmp_w = glyph_w;
        const bmp_h = glyph_h;
        const row_bytes = bmp_w * 4;
        const bmp_buf = try std.heap.page_allocator.alloc(u8, @as(usize, row_bytes) * @as(usize, bmp_h));
        defer std.heap.page_allocator.free(bmp_buf);

        const color_space = ct.CGColorSpaceCreateDeviceRGB();
        defer ct.CGColorSpaceRelease(color_space);

        // Rasterize each ASCII glyph
        for (32..127) |i| {
            const char_code: u8 = @intCast(i);
            var uni_char: ct.UniChar = char_code;
            var glyph: ct.CGGlyph = 0;
            _ = ct.CTFontGetGlyphsForCharacters(font, &uni_char, &glyph, 1);

            // Get glyph bounding box
            var bbox: ct.CGRect = .{
                .origin = .{ .x = 0, .y = 0 },
                .size = .{ .width = 0, .height = 0 },
            };
            _ = ct.CTFontGetBoundingRectsForGlyphs(font, ct.kCTFontOrientationHorizontal, &glyph, &bbox, 1);

            var glyph_advance: ct.CGSize = .{ .width = 0, .height = 0 };
            _ = ct.CTFontGetAdvancesForGlyphs(font, ct.kCTFontOrientationHorizontal, &glyph, &glyph_advance, 1);

            // Atlas position
            const idx = i - 32;
            const atlas_x = @as(u32, @intCast(idx % glyphs_per_row)) * glyph_w;
            const atlas_y = @as(u32, @intCast(idx / glyphs_per_row)) * glyph_h;

            @memset(bmp_buf, 0);

            const ctx = ct.CGBitmapContextCreate(
                bmp_buf.ptr,
                bmp_w,
                bmp_h,
                8,
                row_bytes,
                color_space,
                ct.kCGImageAlphaPremultipliedLast,
            );
            if (ctx == null) continue;
            defer ct.CGContextRelease(ctx);

            // Set text color to white
            ct.CGContextSetRGBFillColor(ctx, 1.0, 1.0, 1.0, 1.0);

            // Draw glyph at baseline position
            const draw_x: ct.CGFloat = 2.0 - bbox.origin.x;
            const draw_y: ct.CGFloat = 2.0 + self.font_descent;
            var position = ct.CGPoint{ .x = draw_x, .y = draw_y };
            ct.CTFontDrawGlyphs(font, &glyph, &position, 1, ctx);

            // Copy bitmap into atlas
            for (0..bmp_h) |row| {
                const dst_y = atlas_y + @as(u32, @intCast(row));
                if (dst_y >= self.height) break;
                const src_offset = row * row_bytes;
                const dst_offset = @as(usize, dst_y) * @as(usize, self.width) * 4 + @as(usize, atlas_x) * 4;
                const copy_bytes = @min(@as(usize, bmp_w) * 4, @as(usize, self.width) * 4 - @as(usize, atlas_x) * 4);
                @memcpy(atlas_pixels[dst_offset .. dst_offset + copy_bytes], bmp_buf[src_offset .. src_offset + copy_bytes]);
            }

            // Store glyph info with UV coordinates
            self.glyphs[i] = .{
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

        // Fill in default for non-printable characters
        for (0..32) |i| {
            self.glyphs[i] = self.glyphs[' '];
        }
        self.glyphs[127] = self.glyphs[' '];

        // Create Metal texture
        const descriptor = objc.msgSend(objc.id, @as(objc.id, @ptrCast(objc.getClass("MTLTextureDescriptor"))), objc.sel("texture2DDescriptorWithPixelFormat:width:height:mipmapped:"), .{
            @as(u64, 70), // MTLPixelFormatRGBA8Unorm
            @as(u64, self.width),
            @as(u64, self.height),
            objc.NO,
        });

        self.texture = objc.msgSend(objc.id, device, objc.sel("newTextureWithDescriptor:"), .{descriptor});

        // Upload pixel data
        const region = extern struct {
            origin_x: u64,
            origin_y: u64,
            origin_z: u64,
            size_w: u64,
            size_h: u64,
            size_d: u64,
        }{
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

    pub fn getGlyph(self: *const Atlas, char: u21) GlyphInfo {
        if (char < 128) {
            return self.glyphs[@intCast(char)];
        }
        // Return space for non-ASCII in MVP
        return self.glyphs[' '];
    }
};
