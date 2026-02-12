const std = @import("std");
const objc = @import("objc.zig");
const terminal = @import("terminal.zig");
const Atlas = @import("atlas.zig").Atlas;

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
        objc.msgSendVoid(attr0, objc.sel("setFormat:"), .{MTLVertexFormatFloat2});
        objc.msgSendVoid(attr0, objc.sel("setOffset:"), .{@as(u64, @offsetOf(Vertex, "position"))});
        objc.msgSendVoid(attr0, objc.sel("setBufferIndex:"), .{@as(u64, 0)});

        // texcoord: float2 at offset 8
        const attr1 = objc.msgSend(objc.id, attributes, objc.sel("objectAtIndexedSubscript:"), .{@as(u64, 1)});
        objc.msgSendVoid(attr1, objc.sel("setFormat:"), .{MTLVertexFormatFloat2});
        objc.msgSendVoid(attr1, objc.sel("setOffset:"), .{@as(u64, @offsetOf(Vertex, "texcoord"))});
        objc.msgSendVoid(attr1, objc.sel("setBufferIndex:"), .{@as(u64, 0)});

        // fg_color: float4 at offset 16
        const attr2 = objc.msgSend(objc.id, attributes, objc.sel("objectAtIndexedSubscript:"), .{@as(u64, 2)});
        objc.msgSendVoid(attr2, objc.sel("setFormat:"), .{MTLVertexFormatFloat4});
        objc.msgSendVoid(attr2, objc.sel("setOffset:"), .{@as(u64, @offsetOf(Vertex, "fg_color"))});
        objc.msgSendVoid(attr2, objc.sel("setBufferIndex:"), .{@as(u64, 0)});

        // bg_color: float4 at offset 32
        const attr3 = objc.msgSend(objc.id, attributes, objc.sel("objectAtIndexedSubscript:"), .{@as(u64, 3)});
        objc.msgSendVoid(attr3, objc.sel("setFormat:"), .{MTLVertexFormatFloat4});
        objc.msgSendVoid(attr3, objc.sel("setOffset:"), .{@as(u64, @offsetOf(Vertex, "bg_color"))});
        objc.msgSendVoid(attr3, objc.sel("setBufferIndex:"), .{@as(u64, 0)});

        // is_bg: float at offset 48
        const attr4 = objc.msgSend(objc.id, attributes, objc.sel("objectAtIndexedSubscript:"), .{@as(u64, 4)});
        objc.msgSendVoid(attr4, objc.sel("setFormat:"), .{MTLVertexFormatFloat});
        objc.msgSendVoid(attr4, objc.sel("setOffset:"), .{@as(u64, @offsetOf(Vertex, "is_bg"))});
        objc.msgSendVoid(attr4, objc.sel("setBufferIndex:"), .{@as(u64, 0)});

        // Layout
        const layouts = objc.msgSend(objc.id, vertex_desc, objc.sel("layouts"), .{});
        const layout0 = objc.msgSend(objc.id, layouts, objc.sel("objectAtIndexedSubscript:"), .{@as(u64, 0)});
        objc.msgSendVoid(layout0, objc.sel("setStride:"), .{@as(u64, @sizeOf(Vertex))});
        objc.msgSendVoid(layout0, objc.sel("setStepFunction:"), .{MTLVertexStepFunctionPerVertex});

        // Pipeline descriptor
        const pipeline_desc = objc.allocInit("MTLRenderPipelineDescriptor");
        objc.msgSendVoid(pipeline_desc, objc.sel("setVertexFunction:"), .{vertex_fn});
        objc.msgSendVoid(pipeline_desc, objc.sel("setFragmentFunction:"), .{fragment_fn});
        objc.msgSendVoid(pipeline_desc, objc.sel("setVertexDescriptor:"), .{vertex_desc});

        // Color attachment
        const color_attachments = objc.msgSend(objc.id, pipeline_desc, objc.sel("colorAttachments"), .{});
        const color_attachment0 = objc.msgSend(objc.id, color_attachments, objc.sel("objectAtIndexedSubscript:"), .{@as(u64, 0)});
        objc.msgSendVoid(color_attachment0, objc.sel("setPixelFormat:"), .{MTLPixelFormatBGRA8Unorm});

        // Enable alpha blending
        objc.msgSendVoid(color_attachment0, objc.sel("setBlendingEnabled:"), .{objc.YES});
        objc.msgSendVoid(color_attachment0, objc.sel("setSourceRGBBlendFactor:"), .{MTLBlendFactorOne});
        objc.msgSendVoid(color_attachment0, objc.sel("setDestinationRGBBlendFactor:"), .{MTLBlendFactorOneMinusSourceAlpha});
        objc.msgSendVoid(color_attachment0, objc.sel("setSourceAlphaBlendFactor:"), .{MTLBlendFactorOne});
        objc.msgSendVoid(color_attachment0, objc.sel("setDestinationAlphaBlendFactor:"), .{MTLBlendFactorOneMinusSourceAlpha});

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
        const atlas = try Atlas.init(allocator, device, 14.0, scale);

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

    fn buildVertices(self: *Renderer, grid: *terminal.Grid) void {
        const cell_w = self.atlas.cell_width;
        const cell_h = self.atlas.cell_height;
        const pad_x = padding_x * self.atlas.scale;
        const pad_y = padding_y * self.atlas.scale;
        const cols = grid.cols;
        const rows = grid.rows;

        // Each cell needs 2 quads (bg + fg) = 12 vertices, plus cursor = 6
        const max_vertices = @as(usize, cols) * @as(usize, rows) * 12 + 6;
        const buf_size = max_vertices * @sizeOf(Vertex);

        if (self.vertex_buffer == null) {
            self.vertex_buffer = objc.msgSend(objc.id, self.device, objc.sel("newBufferWithLength:options:"), .{
                @as(u64, buf_size),
                MTLResourceStorageModeShared,
            });
        }

        const buf_ptr = objc.msgSend([*]Vertex, self.vertex_buffer, objc.sel("contents"), .{});
        var idx: u32 = 0;

        // Background pass
        for (0..rows) |row| {
            for (0..cols) |col| {
                const cell = grid.cells[row * @as(usize, cols) + col];
                if (cell.bg.eql(terminal.default_bg)) continue;

                const x0 = @as(f32, @floatFromInt(col)) * cell_w + pad_x;
                const y0 = @as(f32, @floatFromInt(row)) * cell_h + pad_y;
                writeQuad(buf_ptr, &idx, x0, y0, x0 + cell_w, y0 + cell_h, zero2, zero2, zero4, cell.bg.toFloat4(), 1.0);
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
                writeQuad(buf_ptr, &idx, x0, y0, x0 + glyph.width, y0 + glyph.height, .{ glyph.u0, glyph.v0 }, .{ glyph.u1, glyph.v1 }, cell.fg.toFloat4(), zero4, 0.0);
            }
        }

        // Cursor
        if (grid.cursor_visible) {
            const cx = @as(f32, @floatFromInt(grid.cursor_col)) * cell_w + pad_x;
            const cy = @as(f32, @floatFromInt(grid.cursor_row)) * cell_h + pad_y;
            const cursor_color = [4]f32{ 0.8, 0.8, 0.8, 0.5 };
            writeQuad(buf_ptr, &idx, cx, cy, cx + cell_w, cy + cell_h, zero2, zero2, zero4, cursor_color, 1.0);
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
