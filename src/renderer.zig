const std = @import("std");
const objc = @import("objc.zig");
const terminal = @import("terminal.zig");
const Atlas = @import("atlas.zig").Atlas;

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

    pub fn init(allocator: std.mem.Allocator, device: objc.id, viewport_width: f32, viewport_height: f32, scale: f32) !Renderer {
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

        // Configure vertex attributes
        const attributes = objc.msgSend(objc.id, vertex_desc, objc.sel("attributes"), .{});

        // position: float2 at offset 0
        const attr0 = objc.msgSend(objc.id, attributes, objc.sel("objectAtIndexedSubscript:"), .{@as(u64, 0)});
        objc.msgSendVoid(attr0, objc.sel("setFormat:"), .{@as(u64, 29)}); // MTLVertexFormatFloat2
        objc.msgSendVoid(attr0, objc.sel("setOffset:"), .{@as(u64, @offsetOf(Vertex, "position"))});
        objc.msgSendVoid(attr0, objc.sel("setBufferIndex:"), .{@as(u64, 0)});

        // texcoord: float2 at offset 8
        const attr1 = objc.msgSend(objc.id, attributes, objc.sel("objectAtIndexedSubscript:"), .{@as(u64, 1)});
        objc.msgSendVoid(attr1, objc.sel("setFormat:"), .{@as(u64, 29)}); // MTLVertexFormatFloat2
        objc.msgSendVoid(attr1, objc.sel("setOffset:"), .{@as(u64, @offsetOf(Vertex, "texcoord"))});
        objc.msgSendVoid(attr1, objc.sel("setBufferIndex:"), .{@as(u64, 0)});

        // fg_color: float4 at offset 16
        const attr2 = objc.msgSend(objc.id, attributes, objc.sel("objectAtIndexedSubscript:"), .{@as(u64, 2)});
        objc.msgSendVoid(attr2, objc.sel("setFormat:"), .{@as(u64, 31)}); // MTLVertexFormatFloat4
        objc.msgSendVoid(attr2, objc.sel("setOffset:"), .{@as(u64, @offsetOf(Vertex, "fg_color"))});
        objc.msgSendVoid(attr2, objc.sel("setBufferIndex:"), .{@as(u64, 0)});

        // bg_color: float4 at offset 32
        const attr3 = objc.msgSend(objc.id, attributes, objc.sel("objectAtIndexedSubscript:"), .{@as(u64, 3)});
        objc.msgSendVoid(attr3, objc.sel("setFormat:"), .{@as(u64, 31)}); // MTLVertexFormatFloat4
        objc.msgSendVoid(attr3, objc.sel("setOffset:"), .{@as(u64, @offsetOf(Vertex, "bg_color"))});
        objc.msgSendVoid(attr3, objc.sel("setBufferIndex:"), .{@as(u64, 0)});

        // is_bg: float at offset 48
        const attr4 = objc.msgSend(objc.id, attributes, objc.sel("objectAtIndexedSubscript:"), .{@as(u64, 4)});
        objc.msgSendVoid(attr4, objc.sel("setFormat:"), .{@as(u64, 28)}); // MTLVertexFormatFloat
        objc.msgSendVoid(attr4, objc.sel("setOffset:"), .{@as(u64, @offsetOf(Vertex, "is_bg"))});
        objc.msgSendVoid(attr4, objc.sel("setBufferIndex:"), .{@as(u64, 0)});

        // Layout
        const layouts = objc.msgSend(objc.id, vertex_desc, objc.sel("layouts"), .{});
        const layout0 = objc.msgSend(objc.id, layouts, objc.sel("objectAtIndexedSubscript:"), .{@as(u64, 0)});
        objc.msgSendVoid(layout0, objc.sel("setStride:"), .{@as(u64, @sizeOf(Vertex))});
        objc.msgSendVoid(layout0, objc.sel("setStepFunction:"), .{@as(u64, 1)}); // PerVertex

        // Pipeline descriptor
        const pipeline_desc = objc.allocInit("MTLRenderPipelineDescriptor");
        objc.msgSendVoid(pipeline_desc, objc.sel("setVertexFunction:"), .{vertex_fn});
        objc.msgSendVoid(pipeline_desc, objc.sel("setFragmentFunction:"), .{fragment_fn});
        objc.msgSendVoid(pipeline_desc, objc.sel("setVertexDescriptor:"), .{vertex_desc});

        // Color attachment
        const color_attachments = objc.msgSend(objc.id, pipeline_desc, objc.sel("colorAttachments"), .{});
        const color_attachment0 = objc.msgSend(objc.id, color_attachments, objc.sel("objectAtIndexedSubscript:"), .{@as(u64, 0)});
        objc.msgSendVoid(color_attachment0, objc.sel("setPixelFormat:"), .{@as(u64, 80)}); // BGRA8Unorm

        // Enable alpha blending
        objc.msgSendVoid(color_attachment0, objc.sel("setBlendingEnabled:"), .{objc.YES});
        objc.msgSendVoid(color_attachment0, objc.sel("setSourceRGBBlendFactor:"), .{@as(u64, 1)}); // One
        objc.msgSendVoid(color_attachment0, objc.sel("setDestinationRGBBlendFactor:"), .{@as(u64, 5)}); // OneMinusSourceAlpha
        objc.msgSendVoid(color_attachment0, objc.sel("setSourceAlphaBlendFactor:"), .{@as(u64, 1)}); // One
        objc.msgSendVoid(color_attachment0, objc.sel("setDestinationAlphaBlendFactor:"), .{@as(u64, 5)}); // OneMinusSourceAlpha

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
        objc.msgSendVoid(sampler_desc, objc.sel("setMinFilter:"), .{@as(u64, 0)}); // Nearest
        objc.msgSendVoid(sampler_desc, objc.sel("setMagFilter:"), .{@as(u64, 0)}); // Nearest
        const sampler_state = objc.msgSend(objc.id, device, objc.sel("newSamplerStateWithDescriptor:"), .{sampler_desc});

        // Create uniform buffer
        const uniforms = Uniforms{ .viewport_size = .{ viewport_width, viewport_height } };
        const uniform_buffer = objc.msgSend(objc.id, device, objc.sel("newBufferWithBytes:length:options:"), .{
            @as(*const anyopaque, &uniforms),
            @as(u64, @sizeOf(Uniforms)),
            @as(u64, 0), // MTLResourceStorageModeShared
        });

        // Create atlas at Retina scale
        const atlas = try Atlas.init(device, 14.0, scale);

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

    pub fn render(self: *Renderer, grid: *terminal.Grid, layer: objc.id) void {
        const drawable = objc.msgSend(objc.id, layer, objc.sel("nextDrawable"), .{});
        if (drawable == null) return;

        const texture = objc.msgSend(objc.id, drawable, objc.sel("texture"), .{});

        // Build vertex data
        self.buildVertices(grid);

        if (self.vertex_count == 0) {
            // Just present empty frame
            const cmd_buf = objc.msgSend(objc.id, self.command_queue, objc.sel("commandBuffer"), .{});
            const render_pass_desc = objc.msgSend(objc.id, @as(objc.id, @ptrCast(objc.getClass("MTLRenderPassDescriptor"))), objc.sel("renderPassDescriptor"), .{});

            const rp_color_attachments = objc.msgSend(objc.id, render_pass_desc, objc.sel("colorAttachments"), .{});
            const rp_color0 = objc.msgSend(objc.id, rp_color_attachments, objc.sel("objectAtIndexedSubscript:"), .{@as(u64, 0)});
            objc.msgSendVoid(rp_color0, objc.sel("setTexture:"), .{texture});
            objc.msgSendVoid(rp_color0, objc.sel("setLoadAction:"), .{@as(u64, 2)}); // Clear
            objc.msgSendVoid(rp_color0, objc.sel("setStoreAction:"), .{@as(u64, 1)}); // Store

            // Set clear color (dark background)
            const clear_color = extern struct { r: f64, g: f64, b: f64, a: f64 }{
                .r = 0.118,
                .g = 0.118,
                .b = 0.118,
                .a = 1.0,
            };
            objc.msgSendVoid(rp_color0, objc.sel("setClearColor:"), .{clear_color});

            const encoder = objc.msgSend(objc.id, cmd_buf, objc.sel("renderCommandEncoderWithDescriptor:"), .{render_pass_desc});
            objc.msgSendVoid(encoder, objc.sel("endEncoding"), .{});
            objc.msgSendVoid(cmd_buf, objc.sel("presentDrawable:"), .{drawable});
            objc.msgSendVoid(cmd_buf, objc.sel("commit"), .{});
            return;
        }

        // Create command buffer
        const cmd_buf = objc.msgSend(objc.id, self.command_queue, objc.sel("commandBuffer"), .{});

        // Render pass
        const render_pass_desc = objc.msgSend(objc.id, @as(objc.id, @ptrCast(objc.getClass("MTLRenderPassDescriptor"))), objc.sel("renderPassDescriptor"), .{});

        const rp_color_attachments = objc.msgSend(objc.id, render_pass_desc, objc.sel("colorAttachments"), .{});
        const rp_color0 = objc.msgSend(objc.id, rp_color_attachments, objc.sel("objectAtIndexedSubscript:"), .{@as(u64, 0)});
        objc.msgSendVoid(rp_color0, objc.sel("setTexture:"), .{texture});
        objc.msgSendVoid(rp_color0, objc.sel("setLoadAction:"), .{@as(u64, 2)}); // Clear
        objc.msgSendVoid(rp_color0, objc.sel("setStoreAction:"), .{@as(u64, 1)}); // Store

        const clear_color = extern struct { r: f64, g: f64, b: f64, a: f64 }{
            .r = 0.118,
            .g = 0.118,
            .b = 0.118,
            .a = 1.0,
        };
        objc.msgSendVoid(rp_color0, objc.sel("setClearColor:"), .{clear_color});

        const encoder = objc.msgSend(objc.id, cmd_buf, objc.sel("renderCommandEncoderWithDescriptor:"), .{render_pass_desc});

        objc.msgSendVoid(encoder, objc.sel("setRenderPipelineState:"), .{self.pipeline_state});
        objc.msgSendVoid(encoder, objc.sel("setVertexBuffer:offset:atIndex:"), .{ self.vertex_buffer, @as(u64, 0), @as(u64, 0) });
        objc.msgSendVoid(encoder, objc.sel("setVertexBuffer:offset:atIndex:"), .{ self.uniform_buffer, @as(u64, 0), @as(u64, 1) });
        objc.msgSendVoid(encoder, objc.sel("setFragmentTexture:atIndex:"), .{ self.atlas.texture, @as(u64, 0) });
        objc.msgSendVoid(encoder, objc.sel("setFragmentSamplerState:atIndex:"), .{ self.sampler_state, @as(u64, 0) });

        // Draw triangles
        objc.msgSendVoid(encoder, objc.sel("drawPrimitives:vertexStart:vertexCount:"), .{
            @as(u64, 3), // Triangle
            @as(u64, 0),
            @as(u64, self.vertex_count),
        });

        objc.msgSendVoid(encoder, objc.sel("endEncoding"), .{});
        objc.msgSendVoid(cmd_buf, objc.sel("presentDrawable:"), .{drawable});
        objc.msgSendVoid(cmd_buf, objc.sel("commit"), .{});
    }

    const padding_x: f32 = 4.0; // logical pixels
    const padding_y: f32 = 2.0;

    fn buildVertices(self: *Renderer, grid: *terminal.Grid) void {
        const cell_w = self.atlas.cell_width;
        const cell_h = self.atlas.cell_height;
        const pad_x = padding_x * self.atlas.scale;
        const pad_y = padding_y * self.atlas.scale;
        const cols = grid.cols;
        const rows = grid.rows;

        // Each cell needs 2 quads (bg + fg) = 12 vertices
        // Plus cursor = 6 vertices
        const max_vertices = @as(usize, cols) * @as(usize, rows) * 12 + 6;
        const buf_size = max_vertices * @sizeOf(Vertex);

        // Create or resize vertex buffer
        if (self.vertex_buffer == null) {
            self.vertex_buffer = objc.msgSend(objc.id, self.device, objc.sel("newBufferWithLength:options:"), .{
                @as(u64, buf_size),
                @as(u64, 0), // Shared
            });
        }

        const buf_ptr = objc.msgSend([*]Vertex, self.vertex_buffer, objc.sel("contents"), .{});
        var idx: u32 = 0;

        // Background pass
        for (0..rows) |row| {
            for (0..cols) |col| {
                const cell = grid.cells[row * @as(usize, cols) + col];
                const x0 = @as(f32, @floatFromInt(col)) * cell_w + pad_x;
                const y0 = @as(f32, @floatFromInt(row)) * cell_h + pad_y;
                const x1 = x0 + cell_w;
                const y1 = y0 + cell_h;

                const bg = cell.bg;

                // Only draw bg quad if it's not the default background
                if (!terminal.Color.eql(bg, terminal.default_bg)) {
                    const bg_color = [4]f32{
                        @as(f32, @floatFromInt(bg.r)) / 255.0,
                        @as(f32, @floatFromInt(bg.g)) / 255.0,
                        @as(f32, @floatFromInt(bg.b)) / 255.0,
                        1.0,
                    };

                    // Two triangles for quad
                    buf_ptr[idx] = .{ .position = .{ x0, y0 }, .texcoord = .{ 0, 0 }, .fg_color = .{ 0, 0, 0, 0 }, .bg_color = bg_color, .is_bg = 1.0 };
                    idx += 1;
                    buf_ptr[idx] = .{ .position = .{ x1, y0 }, .texcoord = .{ 0, 0 }, .fg_color = .{ 0, 0, 0, 0 }, .bg_color = bg_color, .is_bg = 1.0 };
                    idx += 1;
                    buf_ptr[idx] = .{ .position = .{ x0, y1 }, .texcoord = .{ 0, 0 }, .fg_color = .{ 0, 0, 0, 0 }, .bg_color = bg_color, .is_bg = 1.0 };
                    idx += 1;
                    buf_ptr[idx] = .{ .position = .{ x1, y0 }, .texcoord = .{ 0, 0 }, .fg_color = .{ 0, 0, 0, 0 }, .bg_color = bg_color, .is_bg = 1.0 };
                    idx += 1;
                    buf_ptr[idx] = .{ .position = .{ x1, y1 }, .texcoord = .{ 0, 0 }, .fg_color = .{ 0, 0, 0, 0 }, .bg_color = bg_color, .is_bg = 1.0 };
                    idx += 1;
                    buf_ptr[idx] = .{ .position = .{ x0, y1 }, .texcoord = .{ 0, 0 }, .fg_color = .{ 0, 0, 0, 0 }, .bg_color = bg_color, .is_bg = 1.0 };
                    idx += 1;
                }
            }
        }

        // Foreground (glyph) pass
        for (0..rows) |row| {
            for (0..cols) |col| {
                const cell = grid.cells[row * @as(usize, cols) + col];
                if (cell.char <= ' ' or cell.char == 127) continue;

                const glyph = self.atlas.getGlyph(cell.char);
                const x0 = @as(f32, @floatFromInt(col)) * cell_w + pad_x;
                const y0 = @as(f32, @floatFromInt(row)) * cell_h + pad_y;
                const x1 = x0 + glyph.width;
                const y1 = y0 + glyph.height;

                const fg = cell.fg;
                const fg_color = [4]f32{
                    @as(f32, @floatFromInt(fg.r)) / 255.0,
                    @as(f32, @floatFromInt(fg.g)) / 255.0,
                    @as(f32, @floatFromInt(fg.b)) / 255.0,
                    1.0,
                };

                // Two triangles for glyph quad
                buf_ptr[idx] = .{ .position = .{ x0, y0 }, .texcoord = .{ glyph.u0, glyph.v0 }, .fg_color = fg_color, .bg_color = .{ 0, 0, 0, 0 }, .is_bg = 0.0 };
                idx += 1;
                buf_ptr[idx] = .{ .position = .{ x1, y0 }, .texcoord = .{ glyph.u1, glyph.v0 }, .fg_color = fg_color, .bg_color = .{ 0, 0, 0, 0 }, .is_bg = 0.0 };
                idx += 1;
                buf_ptr[idx] = .{ .position = .{ x0, y1 }, .texcoord = .{ glyph.u0, glyph.v1 }, .fg_color = fg_color, .bg_color = .{ 0, 0, 0, 0 }, .is_bg = 0.0 };
                idx += 1;
                buf_ptr[idx] = .{ .position = .{ x1, y0 }, .texcoord = .{ glyph.u1, glyph.v0 }, .fg_color = fg_color, .bg_color = .{ 0, 0, 0, 0 }, .is_bg = 0.0 };
                idx += 1;
                buf_ptr[idx] = .{ .position = .{ x1, y1 }, .texcoord = .{ glyph.u1, glyph.v1 }, .fg_color = fg_color, .bg_color = .{ 0, 0, 0, 0 }, .is_bg = 0.0 };
                idx += 1;
                buf_ptr[idx] = .{ .position = .{ x0, y1 }, .texcoord = .{ glyph.u0, glyph.v1 }, .fg_color = fg_color, .bg_color = .{ 0, 0, 0, 0 }, .is_bg = 0.0 };
                idx += 1;
            }
        }

        // Cursor (block cursor)
        {
            const cx = @as(f32, @floatFromInt(grid.cursor_col)) * cell_w + pad_x;
            const cy = @as(f32, @floatFromInt(grid.cursor_row)) * cell_h + pad_y;
            const cx1 = cx + cell_w;
            const cy1 = cy + cell_h;
            const cursor_color = [4]f32{ 0.8, 0.8, 0.8, 0.5 };

            buf_ptr[idx] = .{ .position = .{ cx, cy }, .texcoord = .{ 0, 0 }, .fg_color = .{ 0, 0, 0, 0 }, .bg_color = cursor_color, .is_bg = 1.0 };
            idx += 1;
            buf_ptr[idx] = .{ .position = .{ cx1, cy }, .texcoord = .{ 0, 0 }, .fg_color = .{ 0, 0, 0, 0 }, .bg_color = cursor_color, .is_bg = 1.0 };
            idx += 1;
            buf_ptr[idx] = .{ .position = .{ cx, cy1 }, .texcoord = .{ 0, 0 }, .fg_color = .{ 0, 0, 0, 0 }, .bg_color = cursor_color, .is_bg = 1.0 };
            idx += 1;
            buf_ptr[idx] = .{ .position = .{ cx1, cy }, .texcoord = .{ 0, 0 }, .fg_color = .{ 0, 0, 0, 0 }, .bg_color = cursor_color, .is_bg = 1.0 };
            idx += 1;
            buf_ptr[idx] = .{ .position = .{ cx1, cy1 }, .texcoord = .{ 0, 0 }, .fg_color = .{ 0, 0, 0, 0 }, .bg_color = cursor_color, .is_bg = 1.0 };
            idx += 1;
            buf_ptr[idx] = .{ .position = .{ cx, cy1 }, .texcoord = .{ 0, 0 }, .fg_color = .{ 0, 0, 0, 0 }, .bg_color = cursor_color, .is_bg = 1.0 };
            idx += 1;
        }

        self.vertex_count = idx;
    }

    pub fn updateViewport(self: *Renderer, width: f32, height: f32) void {
        self.viewport_width = width;
        self.viewport_height = height;
        const uniforms = Uniforms{ .viewport_size = .{ width, height } };
        const ptr = objc.msgSend(*Uniforms, self.uniform_buffer, objc.sel("contents"), .{});
        ptr.* = uniforms;
    }
};
