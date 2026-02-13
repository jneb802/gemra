const std = @import("std");
const objc = @import("objc.zig");
const terminal = @import("terminal.zig");
const atlas_mod = @import("atlas.zig");
const Atlas = atlas_mod.Atlas;
pub const FontConfig = atlas_mod.FontConfig;
const FontVariant = atlas_mod.FontVariant;

// Metal enum constants
const MTLPixelFormatBGRA8Unorm: u64 = 80;
const MTLVertexFormatFloat: u64 = 28;
const MTLVertexFormatFloat2: u64 = 29;
const MTLVertexFormatFloat4: u64 = 31;
const MTLLoadActionClear: u64 = 2;
const MTLStoreActionStore: u64 = 1;
const MTLPrimitiveTypeTriangle: u64 = 3;
const MTLBlendFactorOne: u64 = 1;
const MTLBlendFactorOneMinusSourceAlpha: u64 = 5;
const MTLVertexStepFunctionPerVertex: u64 = 1;
const MTLResourceStorageModeShared: u64 = 0;
const MTLSamplerMinMagFilterNearest: u64 = 0;

const ClearColor = extern struct { r: f64, g: f64, b: f64, a: f64 };
const background_clear_color = ClearColor{ .r = 0.118, .g = 0.118, .b = 0.118, .a = 1.0 };

const Vertex = extern struct {
    position: [2]f32,
    texcoord: [2]f32,
    fg_color: [4]f32,
    bg_color: [4]f32,
    is_bg: f32,
};

const Uniforms = extern struct {
    viewport_size: [2]f32,
};

pub const Renderer = struct {
    device: objc.id,
    command_queue: objc.id,
    pipeline_state: objc.id,
    sampler_state: objc.id,
    atlas: Atlas,
    vertex_buffer: objc.id = null,
    uniform_buffer: objc.id,
    vertex_count: u32 = 0,
    viewport_width: f32,
    viewport_height: f32,
    allocator: std.mem.Allocator,

    pub fn init(allocator: std.mem.Allocator, device: objc.id, viewport_width: f32, viewport_height: f32, scale: f32, font_config: FontConfig) !Renderer {
        const command_queue = objc.msgSend(objc.id, device, objc.sel("newCommandQueue"), .{});

        // Compile Metal shader
        const shader_source = @embedFile("shaders/terminal.metal");
        const ns_source = objc.msgSend(objc.id, @as(objc.id, @ptrCast(objc.getClass("NSString"))), objc.sel("stringWithUTF8String:"), .{
            @as([*:0]const u8, shader_source.ptr),
        });

        var compile_error: objc.id = null;
        const library = objc.msgSend(objc.id, device, objc.sel("newLibraryWithSource:options:error:"), .{
            ns_source,
            @as(objc.id, null),
            @as(*objc.id, &compile_error),
        });

        if (library == null) {
            if (compile_error) |err| {
                const desc = objc.msgSend(objc.id, err, objc.sel("localizedDescription"), .{});
                const c_str = objc.msgSend([*:0]const u8, desc, objc.sel("UTF8String"), .{});
                std.debug.print("Metal shader compile error: {s}\n", .{c_str});
            }
            return error.ShaderCompileFailed;
        }

        const vertex_fn_name = objc.msgSend(objc.id, @as(objc.id, @ptrCast(objc.getClass("NSString"))), objc.sel("stringWithUTF8String:"), .{
            @as([*:0]const u8, "vertex_main"),
        });
        const fragment_fn_name = objc.msgSend(objc.id, @as(objc.id, @ptrCast(objc.getClass("NSString"))), objc.sel("stringWithUTF8String:"), .{
            @as([*:0]const u8, "fragment_main"),
        });

        const vertex_fn = objc.msgSend(objc.id, library, objc.sel("newFunctionWithName:"), .{vertex_fn_name});
        const fragment_fn = objc.msgSend(objc.id, library, objc.sel("newFunctionWithName:"), .{fragment_fn_name});

        // Vertex descriptor
        const vertex_desc = objc.msgSend(objc.id, @as(objc.id, @ptrCast(objc.getClass("MTLVertexDescriptor"))), objc.sel("vertexDescriptor"), .{});

        // Configure vertex attributes using helper function
        objc.setupVertexAttribute(vertex_desc, 0, MTLVertexFormatFloat2, @offsetOf(Vertex, "position"), 0);
        objc.setupVertexAttribute(vertex_desc, 1, MTLVertexFormatFloat2, @offsetOf(Vertex, "texcoord"), 0);
        objc.setupVertexAttribute(vertex_desc, 2, MTLVertexFormatFloat4, @offsetOf(Vertex, "fg_color"), 0);
        objc.setupVertexAttribute(vertex_desc, 3, MTLVertexFormatFloat4, @offsetOf(Vertex, "bg_color"), 0);
        objc.setupVertexAttribute(vertex_desc, 4, MTLVertexFormatFloat, @offsetOf(Vertex, "is_bg"), 0);

        // Layout
        const layouts = objc.msgSend(objc.id, vertex_desc, objc.sel("layouts"), .{});
        const layout0 = objc.msgSend(objc.id, layouts, objc.sel("objectAtIndexedSubscript:"), .{@as(u64, 0)});
        objc.msgSendVoid(layout0, objc.sel("setStride:"), .{@as(u64, @sizeOf(Vertex))});
        objc.msgSendVoid(layout0, objc.sel("setStepFunction:"), .{MTLVertexStepFunctionPerVertex});

        // Pipeline descriptor
        const pipeline_desc = objc.allocInit("MTLRenderPipelineDescriptor");
        objc.setPipelineProperty(pipeline_desc, "setVertexFunction:", vertex_fn);
        objc.setPipelineProperty(pipeline_desc, "setFragmentFunction:", fragment_fn);
        objc.setPipelineProperty(pipeline_desc, "setVertexDescriptor:", vertex_desc);

        // Color attachment
        const color_attachments = objc.msgSend(objc.id, pipeline_desc, objc.sel("colorAttachments"), .{});
        const color_attachment0 = objc.msgSend(objc.id, color_attachments, objc.sel("objectAtIndexedSubscript:"), .{@as(u64, 0)});
        objc.setPipelineProperty(color_attachment0, "setPixelFormat:", MTLPixelFormatBGRA8Unorm);

        // Enable alpha blending
        objc.setPipelineProperty(color_attachment0, "setBlendingEnabled:", objc.YES);
        objc.setPipelineProperty(color_attachment0, "setSourceRGBBlendFactor:", MTLBlendFactorOne);
        objc.setPipelineProperty(color_attachment0, "setDestinationRGBBlendFactor:", MTLBlendFactorOneMinusSourceAlpha);
        objc.setPipelineProperty(color_attachment0, "setSourceAlphaBlendFactor:", MTLBlendFactorOne);
        objc.setPipelineProperty(color_attachment0, "setDestinationAlphaBlendFactor:", MTLBlendFactorOneMinusSourceAlpha);

        var pipeline_error: objc.id = null;
        const pipeline_state = objc.msgSend(objc.id, device, objc.sel("newRenderPipelineStateWithDescriptor:error:"), .{
            pipeline_desc,
            @as(*objc.id, &pipeline_error),
        });

        if (pipeline_state == null) {
            if (pipeline_error) |err| {
                const desc = objc.msgSend(objc.id, err, objc.sel("localizedDescription"), .{});
                const c_str = objc.msgSend([*:0]const u8, desc, objc.sel("UTF8String"), .{});
                std.debug.print("Pipeline error: {s}\n", .{c_str});
            }
            return error.PipelineCreateFailed;
        }

        // Create sampler — nearest-neighbor for crisp glyph rendering
        const sampler_desc = objc.allocInit("MTLSamplerDescriptor");
        objc.msgSendVoid(sampler_desc, objc.sel("setMinFilter:"), .{MTLSamplerMinMagFilterNearest});
        objc.msgSendVoid(sampler_desc, objc.sel("setMagFilter:"), .{MTLSamplerMinMagFilterNearest});
        const sampler_state = objc.msgSend(objc.id, device, objc.sel("newSamplerStateWithDescriptor:"), .{sampler_desc});

        // Create uniform buffer
        const uniforms = Uniforms{ .viewport_size = .{ viewport_width, viewport_height } };
        const uniform_buffer = objc.msgSend(objc.id, device, objc.sel("newBufferWithBytes:length:options:"), .{
            @as(*const anyopaque, &uniforms),
            @as(u64, @sizeOf(Uniforms)),
            MTLResourceStorageModeShared,
        });

        // Create atlas at Retina scale
        const atlas = try Atlas.init(allocator, device, font_config, scale);

        return Renderer{
            .device = device,
            .command_queue = command_queue,
            .pipeline_state = pipeline_state,
            .sampler_state = sampler_state,
            .atlas = atlas,
            .uniform_buffer = uniform_buffer,
            .viewport_width = viewport_width,
            .viewport_height = viewport_height,
            .allocator = allocator,
        };
    }

    pub fn render(self: *Renderer, term: *terminal.Terminal, layer: objc.id) void {
        const drawable = objc.msgSend(objc.id, layer, objc.sel("nextDrawable"), .{});
        if (drawable == null) return;

        const texture = objc.msgSend(objc.id, drawable, objc.sel("texture"), .{});

        // Build vertex data
        self.buildVertices(term);

        // Set up render pass (shared between empty and non-empty frames)
        const cmd_buf = objc.msgSend(objc.id, self.command_queue, objc.sel("commandBuffer"), .{});
        const render_pass_desc = objc.msgSend(objc.id, @as(objc.id, @ptrCast(objc.getClass("MTLRenderPassDescriptor"))), objc.sel("renderPassDescriptor"), .{});

        const rp_color_attachments = objc.msgSend(objc.id, render_pass_desc, objc.sel("colorAttachments"), .{});
        const rp_color0 = objc.msgSend(objc.id, rp_color_attachments, objc.sel("objectAtIndexedSubscript:"), .{@as(u64, 0)});
        objc.msgSendVoid(rp_color0, objc.sel("setTexture:"), .{texture});
        objc.msgSendVoid(rp_color0, objc.sel("setLoadAction:"), .{MTLLoadActionClear});
        objc.msgSendVoid(rp_color0, objc.sel("setStoreAction:"), .{MTLStoreActionStore});
        objc.msgSendVoid(rp_color0, objc.sel("setClearColor:"), .{background_clear_color});

        const encoder = objc.msgSend(objc.id, cmd_buf, objc.sel("renderCommandEncoderWithDescriptor:"), .{render_pass_desc});

        if (self.vertex_count > 0) {
            objc.msgSendVoid(encoder, objc.sel("setRenderPipelineState:"), .{self.pipeline_state});
            objc.msgSendVoid(encoder, objc.sel("setVertexBuffer:offset:atIndex:"), .{ self.vertex_buffer, @as(u64, 0), @as(u64, 0) });
            objc.msgSendVoid(encoder, objc.sel("setVertexBuffer:offset:atIndex:"), .{ self.uniform_buffer, @as(u64, 0), @as(u64, 1) });
            objc.msgSendVoid(encoder, objc.sel("setFragmentTexture:atIndex:"), .{ self.atlas.texture, @as(u64, 0) });
            objc.msgSendVoid(encoder, objc.sel("setFragmentSamplerState:atIndex:"), .{ self.sampler_state, @as(u64, 0) });

            objc.msgSendVoid(encoder, objc.sel("drawPrimitives:vertexStart:vertexCount:"), .{
                MTLPrimitiveTypeTriangle,
                @as(u64, 0),
                @as(u64, self.vertex_count),
            });
        }

        objc.msgSendVoid(encoder, objc.sel("endEncoding"), .{});
        objc.msgSendVoid(cmd_buf, objc.sel("presentDrawable:"), .{drawable});
        objc.msgSendVoid(cmd_buf, objc.sel("commit"), .{});
    }

    const zero4 = [4]f32{ 0, 0, 0, 0 };
    const zero2 = [2]f32{ 0, 0 };
    pub const padding_x: f32 = 4.0; // logical pixels
    pub const padding_y: f32 = 2.0;

    fn writeQuad(buf: [*]Vertex, idx: *u32, x0: f32, y0: f32, x1: f32, y1: f32, uv0: [2]f32, uv1: [2]f32, fg: [4]f32, bg: [4]f32, is_bg: f32) void {
        // Two triangles: (0,1,2) and (1,3,2) forming a quad
        const positions = [6][2]f32{ .{ x0, y0 }, .{ x1, y0 }, .{ x0, y1 }, .{ x1, y0 }, .{ x1, y1 }, .{ x0, y1 } };
        const uvs = [6][2]f32{ .{ uv0[0], uv0[1] }, .{ uv1[0], uv0[1] }, .{ uv0[0], uv1[1] }, .{ uv1[0], uv0[1] }, .{ uv1[0], uv1[1] }, .{ uv0[0], uv1[1] } };
        for (positions, uvs) |pos, uv| {
            buf[idx.*] = .{ .position = pos, .texcoord = uv, .fg_color = fg, .bg_color = bg, .is_bg = is_bg };
            idx.* += 1;
        }
    }

    fn buildVertices(self: *Renderer, term: *terminal.Terminal) void {
        const rs = &term.render_state;
        const cell_w = self.atlas.cell_width;
        const cell_h = self.atlas.cell_height;
        const pad_x = padding_x * self.atlas.scale;
        const pad_y = padding_y * self.atlas.scale;
        const cols: usize = rs.cols;
        const rows: usize = rs.rows;

        if (rows == 0 or cols == 0) {
            self.vertex_count = 0;
            return;
        }

        // Each cell: bg(6) + fg(6) + underline(6) + strikethrough(6) + overline(6) = 30, plus cursor = 6
        const max_vertices = cols * rows * 30 + 6;
        const buf_size = max_vertices * @sizeOf(Vertex);

        if (self.vertex_buffer == null) {
            self.vertex_buffer = objc.msgSend(objc.id, self.device, objc.sel("newBufferWithLength:options:"), .{
                @as(u64, buf_size),
                MTLResourceStorageModeShared,
            });
        }

        const buf_ptr = objc.msgSend([*]Vertex, self.vertex_buffer, objc.sel("contents"), .{});
        var idx: u32 = 0;

        // Selection highlight colors
        const sel_bg = [4]f32{ 0.26, 0.47, 0.73, 1.0 }; // blue highlight
        const sel_fg = [4]f32{ 1.0, 1.0, 1.0, 1.0 }; // white text

        const default_style = terminal.Style{};
        const row_slice = rs.row_data.slice();
        const cells_list = row_slice.items(.cells);

        // Background pass
        for (cells_list, 0..) |cells, y| {
            const cell_slice = cells.slice();
            const raw_cells = cell_slice.items(.raw);
            const styles = cell_slice.items(.style);

            for (raw_cells, 0..) |raw_cell, x| {
                if (raw_cell.wide == .spacer_tail) continue;

                const is_selected = if (term.selection) |sel|
                    sel.contains(@intCast(x), @intCast(y))
                else
                    false;

                if (is_selected) {
                    const xf = @as(f32, @floatFromInt(x)) * cell_w + pad_x;
                    const yf = @as(f32, @floatFromInt(y)) * cell_h + pad_y;
                    const w = if (raw_cell.wide == .wide) cell_w * 2 else cell_w;
                    writeQuad(buf_ptr, &idx, xf, yf, xf + w, yf + cell_h, zero2, zero2, zero4, sel_bg, 1.0);
                } else {
                    const style = if (raw_cell.hasStyling()) styles[x] else default_style;
                    const has_styling = raw_cell.hasStyling();

                    // Handle inverse: use fg as bg
                    if (has_styling and style.flags.inverse) {
                        const fg_rgb = style.fg(.{
                            .default = rs.colors.foreground,
                            .palette = &rs.colors.palette,
                        });
                        const xf = @as(f32, @floatFromInt(x)) * cell_w + pad_x;
                        const yf = @as(f32, @floatFromInt(y)) * cell_h + pad_y;
                        const w = if (raw_cell.wide == .wide) cell_w * 2 else cell_w;
                        writeQuad(buf_ptr, &idx, xf, yf, xf + w, yf + cell_h, zero2, zero2, zero4, rgbToFloat4(fg_rgb), 1.0);
                    } else {
                        const bg_rgb = style.bg(&raw_cell, &rs.colors.palette) orelse continue;

                        // Skip if same as default background
                        if (bg_rgb.r == terminal.default_bg.r and bg_rgb.g == terminal.default_bg.g and bg_rgb.b == terminal.default_bg.b) continue;

                        const xf = @as(f32, @floatFromInt(x)) * cell_w + pad_x;
                        const yf = @as(f32, @floatFromInt(y)) * cell_h + pad_y;
                        const w = if (raw_cell.wide == .wide) cell_w * 2 else cell_w;
                        writeQuad(buf_ptr, &idx, xf, yf, xf + w, yf + cell_h, zero2, zero2, zero4, rgbToFloat4(bg_rgb), 1.0);
                    }
                }
            }
        }

        // Foreground (glyph) pass + decoration pass
        for (cells_list, 0..) |cells, y| {
            const cell_slice = cells.slice();
            const raw_cells = cell_slice.items(.raw);
            const styles = cell_slice.items(.style);

            for (raw_cells, 0..) |raw_cell, x| {
                if (raw_cell.wide == .spacer_tail) continue;

                const cp = raw_cell.codepoint();

                const is_selected = if (term.selection) |sel|
                    sel.contains(@intCast(x), @intCast(y))
                else
                    false;

                const style = if (raw_cell.hasStyling()) styles[x] else default_style;
                const has_styling = raw_cell.hasStyling();

                // Determine font variant from style flags
                const variant: FontVariant = if (has_styling and style.flags.bold and style.flags.italic)
                    .bold_italic
                else if (has_styling and style.flags.bold)
                    .bold
                else if (has_styling and style.flags.italic)
                    .italic
                else
                    .regular;

                // Handle invisible: skip glyph entirely
                if (has_styling and style.flags.invisible) {
                    // Still process decorations below, but skip glyph
                } else if (cp > ' ' and cp != 127) {
                    // Resolve colors with inverse support
                    var fg: [4]f32 = undefined;
                    if (is_selected) {
                        fg = sel_fg;
                    } else if (has_styling and style.flags.inverse) {
                        // Inverse: use bg color as fg
                        const bg_rgb = style.bg(&raw_cell, &rs.colors.palette) orelse terminal.default_bg;
                        fg = rgbToFloat4(bg_rgb);
                    } else {
                        fg = rgbToFloat4(style.fg(.{
                            .default = rs.colors.foreground,
                            .palette = &rs.colors.palette,
                        }));
                    }

                    // Handle faint: halve alpha
                    if (has_styling and style.flags.faint) {
                        fg[3] = 0.5;
                    }

                    const glyph = self.atlas.getGlyph(cp, variant);
                    const xf = @as(f32, @floatFromInt(x)) * cell_w + pad_x;
                    const yf = @as(f32, @floatFromInt(y)) * cell_h + pad_y;
                    writeQuad(buf_ptr, &idx, xf, yf, xf + glyph.width, yf + glyph.height, .{ glyph.u0, glyph.v0 }, .{ glyph.u1, glyph.v1 }, fg, zero4, 0.0);
                }

                // Decorations (underline, strikethrough, overline)
                if (has_styling) {
                    const xf = @as(f32, @floatFromInt(x)) * cell_w + pad_x;
                    const yf = @as(f32, @floatFromInt(y)) * cell_h + pad_y;
                    const w = if (raw_cell.wide == .wide) cell_w * 2 else cell_w;
                    const line_thickness = @max(1.0, @ceil(self.atlas.scale));

                    // Resolve decoration color (fg color by default)
                    const dec_color = if (is_selected) sel_fg else rgbToFloat4(style.fg(.{
                        .default = rs.colors.foreground,
                        .palette = &rs.colors.palette,
                    }));

                    // Underline
                    if (style.flags.underline != .none) {
                        const ul_color = blk: {
                            if (style.underlineColor(&rs.colors.palette)) |c| {
                                break :blk rgbToFloat4(c);
                            }
                            break :blk dec_color;
                        };
                        const ul_y = yf + self.atlas.font_ascent + 1.0;
                        writeQuad(buf_ptr, &idx, xf, ul_y, xf + w, ul_y + line_thickness, zero2, zero2, zero4, ul_color, 1.0);
                        if (style.flags.underline == .double) {
                            const ul_y2 = ul_y + line_thickness + 1.0;
                            writeQuad(buf_ptr, &idx, xf, ul_y2, xf + w, ul_y2 + line_thickness, zero2, zero2, zero4, ul_color, 1.0);
                        }
                    }

                    // Strikethrough
                    if (style.flags.strikethrough) {
                        const st_y = yf + cell_h * 0.5 - line_thickness * 0.5;
                        writeQuad(buf_ptr, &idx, xf, st_y, xf + w, st_y + line_thickness, zero2, zero2, zero4, dec_color, 1.0);
                    }

                    // Overline
                    if (style.flags.overline) {
                        writeQuad(buf_ptr, &idx, xf, yf, xf + w, yf + line_thickness, zero2, zero2, zero4, dec_color, 1.0);
                    }
                }
            }
        }

        // Cursor
        if (rs.cursor.visible) {
            if (rs.cursor.viewport) |vp| {
                const cx = @as(f32, @floatFromInt(vp.x)) * cell_w + pad_x;
                const cy = @as(f32, @floatFromInt(vp.y)) * cell_h + pad_y;
                const cursor_color = [4]f32{ 0.8, 0.8, 0.8, 0.5 };
                writeQuad(buf_ptr, &idx, cx, cy, cx + cell_w, cy + cell_h, zero2, zero2, zero4, cursor_color, 1.0);
            }
        }

        self.vertex_count = idx;
    }

    fn rgbToFloat4(c: terminal.Color) [4]f32 {
        return .{
            @as(f32, @floatFromInt(c.r)) / 255.0,
            @as(f32, @floatFromInt(c.g)) / 255.0,
            @as(f32, @floatFromInt(c.b)) / 255.0,
            1.0,
        };
    }

    pub fn updateViewport(self: *Renderer, width: f32, height: f32) void {
        self.viewport_width = width;
        self.viewport_height = height;
        const uniforms = Uniforms{ .viewport_size = .{ width, height } };
        const ptr = objc.msgSend(*Uniforms, self.uniform_buffer, objc.sel("contents"), .{});
        ptr.* = uniforms;
    }
};
