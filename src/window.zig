const std = @import("std");
const objc = @import("objc.zig");
const terminal = @import("terminal.zig");
const Renderer = @import("renderer.zig").Renderer;
const input = @import("input.zig");
const ghostty = @import("ghostty-vt");
const posix = std.posix;

pub const AppContext = struct {
    pty: *@import("pty.zig").Pty,
    term: *terminal.Terminal,
    renderer: *Renderer,
    mutex: *std.Thread.Mutex,
    layer: objc.id,
    needs_render: *std.atomic.Value(bool),
};

var global_app_context: ?*AppContext = null;

// Click tracking for double/triple click detection
var last_click_time: i128 = 0;
var last_click_col: u16 = 0;
var last_click_row: u16 = 0;
var click_count: u8 = 0;
const multi_click_threshold_ns: i128 = 400 * std.time.ns_per_ms;

pub fn sharedApp() objc.id {
    return objc.msgSend(objc.id, @as(objc.id, @ptrCast(objc.getClass("NSApplication"))), objc.sel("sharedApplication"), .{});
}

// Objective-C class method implementations for GemraView
fn viewKeyDown(_: objc.id, _: objc.SEL, event: objc.id) callconv(.c) void {
    const ctx = global_app_context orelse return;

    const flags = objc.msgSend(u64, event, objc.sel("modifierFlags"), .{});
    const cmd = (flags & (1 << 20)) != 0;
    const key_code = objc.msgSend(u16, event, objc.sel("keyCode"), .{});

    const chars = objc.msgSend(objc.id, event, objc.sel("characters"), .{});
    const char_val: u16 = if (chars != null and objc.msgSend(u64, chars, objc.sel("length"), .{}) > 0)
        objc.msgSend(u16, chars, objc.sel("characterAtIndex:"), .{@as(u64, 0)})
    else
        0;

    // Cmd+V: paste from clipboard
    if (cmd and (char_val == 'v' or char_val == 'V')) {
        handlePaste(ctx);
        return;
    }

    // Cmd+C: copy selection to clipboard
    if (cmd and (char_val == 'c' or char_val == 'C')) {
        handleCopy(ctx);
        return;
    }

    // Ignore other Cmd+ shortcuts (let system handle them)
    if (cmd) return;

    // Map macOS keycode to ghostty Key
    const key = input.keyFromMacKeycode(key_code);

    // Get UTF-8 text from the event, filtering Apple private-use codepoints
    var utf8_buf: [32]u8 = undefined;
    var utf8_len: usize = 0;
    if (chars != null) {
        const raw_utf8 = objc.msgSend(?[*:0]const u8, chars, objc.sel("UTF8String"), .{});
        if (raw_utf8) |s| {
            // Copy UTF-8, but skip Apple private-use area (0xF700-0xF8FF encoded in UTF-8)
            var i: usize = 0;
            while (s[i] != 0 and utf8_len < utf8_buf.len) {
                const byte = s[i];
                if (byte < 0x80) {
                    utf8_buf[utf8_len] = byte;
                    utf8_len += 1;
                    i += 1;
                } else {
                    // Decode UTF-8 to check for private-use codepoints
                    const seq_len = std.unicode.utf8ByteSequenceLength(byte) catch {
                        i += 1;
                        continue;
                    };
                    if (i + seq_len > std.mem.len(s)) break;
                    var seq: [4]u8 = undefined;
                    for (0..seq_len) |j| seq[j] = s[i + j];
                    const cp = std.unicode.utf8Decode(seq[0..seq_len]) catch {
                        i += seq_len;
                        continue;
                    };
                    if (cp >= 0xF700 and cp <= 0xF8FF) {
                        // Skip Apple private-use codepoint
                        i += seq_len;
                        continue;
                    }
                    // Copy the valid UTF-8 sequence
                    if (utf8_len + seq_len <= utf8_buf.len) {
                        for (0..seq_len) |j| utf8_buf[utf8_len + j] = s[i + j];
                        utf8_len += seq_len;
                    }
                    i += seq_len;
                }
            }
        }
    }

    // Get unshifted codepoint from charactersIgnoringModifiers
    var unshifted_codepoint: u21 = 0;
    const unmod_chars = objc.msgSend(objc.id, event, objc.sel("charactersIgnoringModifiers"), .{});
    if (unmod_chars != null and objc.msgSend(u64, unmod_chars, objc.sel("length"), .{}) > 0) {
        const uc = objc.msgSend(u16, unmod_chars, objc.sel("characterAtIndex:"), .{@as(u64, 0)});
        // Only use if not in Apple private-use area
        if (uc < 0xF700 or uc > 0xF8FF) {
            unshifted_codepoint = @intCast(uc);
        }
    }

    // Build mods
    const mods = input.modsFromNSEventFlags(flags);

    // Build consumed_mods: shift is consumed if it produced different text
    var consumed_mods: input.KeyMods = .{};
    if (mods.shift and utf8_len > 0) {
        consumed_mods.shift = true;
    }

    // Build KeyEvent
    const key_event: input.KeyEvent = .{
        .key = key,
        .mods = mods,
        .consumed_mods = consumed_mods,
        .utf8 = utf8_buf[0..utf8_len],
        .unshifted_codepoint = unshifted_codepoint,
        .action = .press,
    };

    // Get encoding options from terminal state
    ctx.mutex.lock();
    const opts = input.KeyEncodeOptions.fromTerminal(&ctx.term.inner);
    ctx.mutex.unlock();

    // Encode the key
    var enc_buf: [128]u8 = undefined;
    var writer: std.Io.Writer = .fixed(&enc_buf);
    input.encodeKey(&writer, key_event, opts) catch return;
    const encoded = writer.buffered();

    if (encoded.len > 0) {
        _ = ctx.pty.write(encoded) catch {};
    }
}

fn handlePaste(ctx: *AppContext) void {
    const NSPasteboard = @as(objc.id, @ptrCast(objc.getClass("NSPasteboard")));
    const pb = objc.msgSend(objc.id, NSPasteboard, objc.sel("generalPasteboard"), .{});
    const pb_type = objc.msgSend(objc.id, @as(objc.id, @ptrCast(objc.getClass("NSString"))), objc.sel("stringWithUTF8String:"), .{
        @as([*:0]const u8, "public.utf8-plain-text"),
    });
    const str = objc.msgSend(objc.id, pb, objc.sel("stringForType:"), .{pb_type});
    if (str == null) return;

    const raw_utf8 = objc.msgSend(?[*:0]const u8, str, objc.sel("UTF8String"), .{}) orelse return;

    // Find length
    var data_len: usize = 0;
    while (raw_utf8[data_len] != 0) : (data_len += 1) {}
    if (data_len == 0) return;

    const data: []const u8 = raw_utf8[0..data_len];

    // Get paste options from terminal state
    ctx.mutex.lock();
    const opts = input.PasteOptions.fromTerminal(&ctx.term.inner);
    ctx.mutex.unlock();

    // Try encoding as const first
    const result = input.encodePaste(data, opts) catch |err| switch (err) {
        error.MutableRequired => {
            // Need mutable copy to replace \n with \r
            const alloc = std.heap.page_allocator;
            const mutable_data = alloc.dupe(u8, data) catch return;
            defer alloc.free(mutable_data);
            const mutable_result = input.encodePaste(mutable_data, opts);
            if (mutable_result[0].len > 0) _ = ctx.pty.write(mutable_result[0]) catch {};
            if (mutable_result[1].len > 0) _ = ctx.pty.write(mutable_result[1]) catch {};
            if (mutable_result[2].len > 0) _ = ctx.pty.write(mutable_result[2]) catch {};
            return;
        },
    };

    if (result[0].len > 0) _ = ctx.pty.write(result[0]) catch {};
    if (result[1].len > 0) _ = ctx.pty.write(result[1]) catch {};
    if (result[2].len > 0) _ = ctx.pty.write(result[2]) catch {};
}

fn handleCopy(ctx: *AppContext) void {
    ctx.mutex.lock();
    const sel_text = if (ctx.term.selection) |sel| blk: {
        if (!sel.active) break :blk null;
        break :blk sel.extractText(&ctx.term.render_state, std.heap.page_allocator) catch null;
    } else null;
    ctx.mutex.unlock();

    if (sel_text) |text| {
        defer std.heap.page_allocator.free(text);
        copyToClipboard(text);
        // Clear selection after copy
        ctx.mutex.lock();
        ctx.term.selection = null;
        ctx.mutex.unlock();
        ctx.needs_render.store(true, .release);
    }
}

fn viewFlagsChanged(_: objc.id, _: objc.SEL, _: objc.id) callconv(.c) void {}

fn pixelToGrid(self_view: objc.id, event: objc.id, ctx: *AppContext) terminal.Selection.GridPoint {
    const location = objc.msgSend(objc.CGPoint, event, objc.sel("locationInWindow"), .{});
    const view_loc = objc.msgSend(objc.CGPoint, self_view, objc.sel("convertPoint:fromView:"), .{
        location, @as(objc.id, null),
    });

    // Get view bounds to flip Y (AppKit is bottom-up, terminal is top-down)
    const view_bounds = objc.msgSend(objc.CGRect, self_view, objc.sel("bounds"), .{});
    const flipped_y = view_bounds.size.height - view_loc.y;

    // Get scale factor
    const win = objc.msgSend(objc.id, self_view, objc.sel("window"), .{});
    const scale: f32 = if (win != null)
        @floatCast(objc.msgSend(objc.CGFloat, win, objc.sel("backingScaleFactor"), .{}))
    else
        1.0;

    // Convert to physical pixels, then to grid coordinates
    const pad_x = Renderer.padding_x * scale;
    const pad_y = Renderer.padding_y * scale;
    const cell_w = ctx.renderer.atlas.cell_width;
    const cell_h = ctx.renderer.atlas.cell_height;

    const px: f32 = @as(f32, @floatCast(view_loc.x)) * scale;
    const py: f32 = @as(f32, @floatCast(flipped_y)) * scale;

    const col_f = (px - pad_x) / cell_w;
    const row_f = (py - pad_y) / cell_h;

    const term_cols: u16 = @intCast(ctx.term.inner.cols);
    const term_rows: u16 = @intCast(ctx.term.inner.rows);

    const col: u16 = if (col_f < 0) 0 else @min(@as(u16, @intFromFloat(col_f)), term_cols -| 1);
    const row: u16 = if (row_f < 0) 0 else @min(@as(u16, @intFromFloat(row_f)), term_rows -| 1);

    return .{ .col = col, .row = row };
}

fn viewMouseDown(self_view: objc.id, _: objc.SEL, event: objc.id) callconv(.c) void {
    const ctx = global_app_context orelse return;
    const point = pixelToGrid(self_view, event, ctx);
    const flags = objc.msgSend(u64, event, objc.sel("modifierFlags"), .{});
    const mods = input.modsFromNSEventFlags(flags);

    // Check if mouse reporting is active
    ctx.mutex.lock();
    const mode = input.mouseMode(&ctx.term.inner);
    ctx.mutex.unlock();

    if (mode != .none) {
        // Report mouse press to terminal
        input.writeMouseEvent(ctx.pty.master_fd, &ctx.term.inner, 0, point.col, point.row, false, false, mods);
        return;
    }

    // Selection handling (unchanged)
    const now = std.time.nanoTimestamp();
    if (now - last_click_time < multi_click_threshold_ns and
        point.col == last_click_col and point.row == last_click_row)
    {
        click_count = if (click_count >= 3) 1 else click_count + 1;
    } else {
        click_count = 1;
    }
    last_click_time = now;
    last_click_col = point.col;
    last_click_row = point.row;

    const alt = (flags & (1 << 19)) != 0;

    ctx.mutex.lock();
    defer ctx.mutex.unlock();

    const term_cols: u16 = @intCast(ctx.term.inner.cols);

    switch (click_count) {
        2 => {
            const bounds = ctx.term.wordBounds(point.col, point.row);
            ctx.term.selection = terminal.Selection{
                .anchor = .{ .col = bounds.start, .row = point.row },
                .endpoint = .{ .col = bounds.end, .row = point.row },
                .active = true,
                .mode = .word,
                .rectangle = false,
            };
        },
        3 => {
            ctx.term.selection = terminal.Selection{
                .anchor = .{ .col = 0, .row = point.row },
                .endpoint = .{ .col = term_cols -| 1, .row = point.row },
                .active = true,
                .mode = .line,
                .rectangle = false,
            };
        },
        else => {
            ctx.term.selection = terminal.Selection{
                .anchor = point,
                .endpoint = point,
                .active = true,
                .mode = .normal,
                .rectangle = alt,
            };
        },
    }

    ctx.needs_render.store(true, .release);
}

fn viewMouseDragged(self_view: objc.id, _: objc.SEL, event: objc.id) callconv(.c) void {
    const ctx = global_app_context orelse return;
    const point = pixelToGrid(self_view, event, ctx);
    const flags = objc.msgSend(u64, event, objc.sel("modifierFlags"), .{});
    const mods = input.modsFromNSEventFlags(flags);

    // Check if mouse reporting is active
    ctx.mutex.lock();
    const mode = input.mouseMode(&ctx.term.inner);
    ctx.mutex.unlock();

    if (mode == .button or mode == .any) {
        // Report mouse drag (button 0 + motion flag)
        input.writeMouseEvent(ctx.pty.master_fd, &ctx.term.inner, 0, point.col, point.row, false, true, mods);
        return;
    }

    // Selection handling (unchanged)
    ctx.mutex.lock();
    defer ctx.mutex.unlock();

    const term_cols: u16 = @intCast(ctx.term.inner.cols);

    if (ctx.term.selection) |*sel| {
        switch (sel.mode) {
            .word => {
                const bounds = ctx.term.wordBounds(point.col, point.row);
                const anchor_bounds = ctx.term.wordBounds(sel.anchor.col, sel.anchor.row);
                if (point.row < sel.anchor.row or
                    (point.row == sel.anchor.row and point.col < sel.anchor.col))
                {
                    sel.anchor = .{ .col = anchor_bounds.end, .row = sel.anchor.row };
                    sel.endpoint = .{ .col = bounds.start, .row = point.row };
                } else {
                    sel.anchor = .{ .col = anchor_bounds.start, .row = sel.anchor.row };
                    sel.endpoint = .{ .col = bounds.end, .row = point.row };
                }
            },
            .line => {
                if (point.row < sel.anchor.row) {
                    sel.endpoint = .{ .col = 0, .row = point.row };
                    sel.anchor = .{ .col = term_cols -| 1, .row = last_click_row };
                } else {
                    sel.anchor = .{ .col = 0, .row = last_click_row };
                    sel.endpoint = .{ .col = term_cols -| 1, .row = point.row };
                }
            },
            .normal => {
                sel.endpoint = point;
            },
        }

        ctx.needs_render.store(true, .release);
    }
}

fn viewMouseUp(self_view: objc.id, _: objc.SEL, event: objc.id) callconv(.c) void {
    const ctx = global_app_context orelse return;

    // Check if mouse reporting is active
    ctx.mutex.lock();
    const mode = input.mouseMode(&ctx.term.inner);
    ctx.mutex.unlock();

    if (mode != .none and mode != .x10) {
        const point = pixelToGrid(self_view, event, ctx);
        const flags = objc.msgSend(u64, event, objc.sel("modifierFlags"), .{});
        const mods = input.modsFromNSEventFlags(flags);
        input.writeMouseEvent(ctx.pty.master_fd, &ctx.term.inner, 0, point.col, point.row, true, false, mods);
        return;
    }

    // Selection handling (unchanged)
    ctx.mutex.lock();
    defer ctx.mutex.unlock();

    if (ctx.term.selection) |sel| {
        if (sel.anchor.col == sel.endpoint.col and sel.anchor.row == sel.endpoint.row and sel.mode == .normal) {
            ctx.term.selection = null;
            ctx.needs_render.store(true, .release);
        }
    }
}

fn viewRightMouseDown(self_view: objc.id, _: objc.SEL, event: objc.id) callconv(.c) void {
    const ctx = global_app_context orelse return;

    ctx.mutex.lock();
    const mode = input.mouseMode(&ctx.term.inner);
    ctx.mutex.unlock();

    if (mode != .none) {
        const point = pixelToGrid(self_view, event, ctx);
        const flags = objc.msgSend(u64, event, objc.sel("modifierFlags"), .{});
        const mods = input.modsFromNSEventFlags(flags);
        input.writeMouseEvent(ctx.pty.master_fd, &ctx.term.inner, 2, point.col, point.row, false, false, mods);
    }
}

fn viewRightMouseUp(self_view: objc.id, _: objc.SEL, event: objc.id) callconv(.c) void {
    const ctx = global_app_context orelse return;

    ctx.mutex.lock();
    const mode = input.mouseMode(&ctx.term.inner);
    ctx.mutex.unlock();

    if (mode != .none and mode != .x10) {
        const point = pixelToGrid(self_view, event, ctx);
        const flags = objc.msgSend(u64, event, objc.sel("modifierFlags"), .{});
        const mods = input.modsFromNSEventFlags(flags);
        input.writeMouseEvent(ctx.pty.master_fd, &ctx.term.inner, 2, point.col, point.row, true, false, mods);
    }
}

fn viewScrollWheel(self_view: objc.id, _: objc.SEL, event: objc.id) callconv(.c) void {
    const ctx = global_app_context orelse return;

    ctx.mutex.lock();
    const mode = input.mouseMode(&ctx.term.inner);
    ctx.mutex.unlock();

    if (mode == .none) return;

    const delta_y = objc.msgSend(objc.CGFloat, event, objc.sel("scrollingDeltaY"), .{});

    // Determine scroll direction
    if (delta_y == 0.0) return;
    const base_button: u8 = if (delta_y > 0.0) 64 else 65; // 64=scroll up, 65=scroll down

    const point = pixelToGrid(self_view, event, ctx);
    const flags = objc.msgSend(u64, event, objc.sel("modifierFlags"), .{});
    const mods = input.modsFromNSEventFlags(flags);

    // Send multiple scroll events for larger deltas
    const abs_delta = @abs(delta_y);
    const count: usize = @max(1, @as(usize, @intFromFloat(@min(abs_delta, 5.0))));
    for (0..count) |_| {
        input.writeMouseEvent(ctx.pty.master_fd, &ctx.term.inner, base_button, point.col, point.row, false, false, mods);
    }
}

fn copyToClipboard(text: []const u8) void {
    // Need null-terminated copy
    const alloc = std.heap.page_allocator;
    const z_text = alloc.alloc(u8, text.len + 1) catch return;
    defer alloc.free(z_text);
    @memcpy(z_text[0..text.len], text);
    z_text[text.len] = 0;

    const NSPasteboard = @as(objc.id, @ptrCast(objc.getClass("NSPasteboard")));
    const pb = objc.msgSend(objc.id, NSPasteboard, objc.sel("generalPasteboard"), .{});

    _ = objc.msgSend(objc.NSInteger, pb, objc.sel("clearContents"), .{});

    const NSString = @as(objc.id, @ptrCast(objc.getClass("NSString")));
    const ns_str = objc.msgSend(objc.id, NSString, objc.sel("stringWithUTF8String:"), .{
        @as([*:0]const u8, @ptrCast(z_text.ptr)),
    });

    const pb_type = objc.msgSend(objc.id, NSString, objc.sel("stringWithUTF8String:"), .{
        @as([*:0]const u8, "public.utf8-plain-text"),
    });
    _ = objc.msgSend(objc.BOOL, pb, objc.sel("setString:forType:"), .{ ns_str, pb_type });
}

fn viewAcceptsFirstResponder(_: objc.id, _: objc.SEL) callconv(.c) objc.BOOL {
    return objc.YES;
}

fn viewWantsLayer(_: objc.id, _: objc.SEL) callconv(.c) objc.BOOL {
    return objc.YES;
}

fn viewIsOpaque(_: objc.id, _: objc.SEL) callconv(.c) objc.BOOL {
    return objc.YES;
}

fn viewCanBecomeKeyView(_: objc.id, _: objc.SEL) callconv(.c) objc.BOOL {
    return objc.YES;
}

fn viewSetFrameSize(self_view: objc.id, _sel: objc.SEL, new_size: objc.CGSize) callconv(.c) void {
    // Call super's setFrameSize:
    const super = objc.Super{
        .receiver = self_view,
        .super_class = objc.getClass("NSView"),
    };
    objc.msgSendSuper(void, &super, _sel, .{new_size});

    const ctx = global_app_context orelse return;

    const win = objc.msgSend(objc.id, self_view, objc.sel("window"), .{});
    if (win == null) return;
    const scale = objc.msgSend(objc.CGFloat, win, objc.sel("backingScaleFactor"), .{});

    const scaled_w = new_size.width * scale;
    const scaled_h = new_size.height * scale;

    // Update Metal layer
    objc.msgSendVoid(ctx.layer, objc.sel("setContentsScale:"), .{scale});
    objc.msgSendVoid(ctx.layer, objc.sel("setDrawableSize:"), .{objc.CGSize{ .width = scaled_w, .height = scaled_h }});

    // Update renderer viewport
    ctx.renderer.updateViewport(@floatCast(scaled_w), @floatCast(scaled_h));

    // Calculate new grid dimensions
    const pad_x = Renderer.padding_x * ctx.renderer.atlas.scale;
    const pad_y = Renderer.padding_y * ctx.renderer.atlas.scale;
    const cell_w = ctx.renderer.atlas.cell_width;
    const cell_h = ctx.renderer.atlas.cell_height;

    const usable_w: f32 = @floatCast(scaled_w - 2.0 * pad_x);
    const usable_h: f32 = @floatCast(scaled_h - 2.0 * pad_y);
    if (usable_w <= 0 or usable_h <= 0) return;

    const new_cols: u16 = @intFromFloat(@floor(usable_w / cell_w));
    const new_rows: u16 = @intFromFloat(@floor(usable_h / cell_h));
    if (new_cols < 1 or new_rows < 1) return;

    if (new_cols != ctx.term.inner.cols or new_rows != ctx.term.inner.rows) {
        ctx.mutex.lock();
        defer ctx.mutex.unlock();

        ctx.term.resize(new_cols, new_rows) catch {};
        ctx.pty.setSize(new_cols, new_rows);

        // Invalidate vertex buffer (size changed)
        if (ctx.renderer.vertex_buffer != null) {
            objc.msgSendVoid(ctx.renderer.vertex_buffer, objc.sel("release"), .{});
            ctx.renderer.vertex_buffer = null;
        }
    }

    ctx.needs_render.store(true, .release);
}

fn delegateShouldTerminate(_: objc.id, _: objc.SEL, _: objc.id) callconv(.c) objc.BOOL {
    return objc.YES;
}

fn delegateDidFinishLaunching(_: objc.id, _: objc.SEL, _: objc.id) callconv(.c) void {
    objc.msgSendVoid(sharedApp(), objc.sel("activateIgnoringOtherApps:"), .{objc.YES});
}

fn delegateWindowDidBecomeKey(_: objc.id, _: objc.SEL, _: objc.id) callconv(.c) void {
    const ctx = global_app_context orelse return;

    ctx.mutex.lock();
    const focus_mode = ctx.term.inner.modes.get(.focus_event);
    ctx.mutex.unlock();

    if (focus_mode) {
        _ = ctx.pty.write("\x1b[I") catch {};
    }
}

fn delegateWindowDidResignKey(_: objc.id, _: objc.SEL, _: objc.id) callconv(.c) void {
    const ctx = global_app_context orelse return;

    ctx.mutex.lock();
    const focus_mode = ctx.term.inner.modes.get(.focus_event);
    ctx.mutex.unlock();

    if (focus_mode) {
        _ = ctx.pty.write("\x1b[O") catch {};
    }
}

fn delegateTimerFired(_: objc.id, _: objc.SEL, _: objc.id) callconv(.c) void {
    const ctx = global_app_context orelse return;

    if (ctx.needs_render.load(.acquire)) {
        ctx.mutex.lock();
        defer ctx.mutex.unlock();

        // Update render state from terminal (handles dirty tracking)
        ctx.term.updateRenderState() catch {};

        ctx.renderer.render(ctx.term, ctx.layer);
        ctx.needs_render.store(false, .release);
    }
}

pub fn createViewClass() objc.Class {
    const nsview = objc.getClass("NSView");
    const cls = objc.allocateClassPair(nsview, "GemraView");

    objc.addMethod(cls, objc.sel("keyDown:"), @ptrCast(&viewKeyDown), "v@:@");
    objc.addMethod(cls, objc.sel("flagsChanged:"), @ptrCast(&viewFlagsChanged), "v@:@");
    objc.addMethod(cls, objc.sel("mouseDown:"), @ptrCast(&viewMouseDown), "v@:@");
    objc.addMethod(cls, objc.sel("mouseDragged:"), @ptrCast(&viewMouseDragged), "v@:@");
    objc.addMethod(cls, objc.sel("mouseUp:"), @ptrCast(&viewMouseUp), "v@:@");
    objc.addMethod(cls, objc.sel("rightMouseDown:"), @ptrCast(&viewRightMouseDown), "v@:@");
    objc.addMethod(cls, objc.sel("rightMouseUp:"), @ptrCast(&viewRightMouseUp), "v@:@");
    objc.addMethod(cls, objc.sel("scrollWheel:"), @ptrCast(&viewScrollWheel), "v@:@");
    objc.addMethod(cls, objc.sel("acceptsFirstResponder"), @ptrCast(&viewAcceptsFirstResponder), "B@:");
    objc.addMethod(cls, objc.sel("wantsLayer"), @ptrCast(&viewWantsLayer), "B@:");
    objc.addMethod(cls, objc.sel("isOpaque"), @ptrCast(&viewIsOpaque), "B@:");
    objc.addMethod(cls, objc.sel("canBecomeKeyView"), @ptrCast(&viewCanBecomeKeyView), "B@:");
    objc.addMethod(cls, objc.sel("setFrameSize:"), @ptrCast(&viewSetFrameSize), "v@:{CGSize=dd}");

    objc.registerClassPair(cls);
    return cls;
}

pub fn createDelegateClass() objc.Class {
    const nsobject = objc.getClass("NSObject");
    const cls = objc.allocateClassPair(nsobject, "GemraDelegate");

    objc.addMethod(cls, objc.sel("applicationShouldTerminateAfterLastWindowClosed:"), @ptrCast(&delegateShouldTerminate), "B@:@");
    objc.addMethod(cls, objc.sel("applicationDidFinishLaunching:"), @ptrCast(&delegateDidFinishLaunching), "v@:@");
    objc.addMethod(cls, objc.sel("timerFired:"), @ptrCast(&delegateTimerFired), "v@:@");
    objc.addMethod(cls, objc.sel("windowDidBecomeKey:"), @ptrCast(&delegateWindowDidBecomeKey), "v@:@");
    objc.addMethod(cls, objc.sel("windowDidResignKey:"), @ptrCast(&delegateWindowDidResignKey), "v@:@");

    objc.registerClassPair(cls);
    return cls;
}

pub fn setup(ctx: *AppContext) !void {
    global_app_context = ctx;

    const app = sharedApp();
    objc.msgSendVoid(app, objc.sel("setActivationPolicy:"), .{@as(i64, 0)});

    const delegate_cls = createDelegateClass();
    const delegate = objc.alloc(delegate_cls);
    const delegate_obj = objc.msgSend(objc.id, delegate, objc.sel("init"), .{});
    objc.msgSendVoid(app, objc.sel("setDelegate:"), .{delegate_obj});

    const style_mask: u64 = (1 << 0) | (1 << 1) | (1 << 2) | (1 << 3);
    const frame = objc.CGRect{
        .origin = .{ .x = 200, .y = 200 },
        .size = .{ .width = 800, .height = 600 },
    };

    const NSWindow = objc.getClass("NSWindow");
    const win = objc.msgSend(objc.id, objc.alloc(NSWindow), objc.sel("initWithContentRect:styleMask:backing:defer:"), .{
        frame,
        style_mask,
        @as(u64, 2),
        objc.NO,
    });

    const title = objc.msgSend(objc.id, @as(objc.id, @ptrCast(objc.getClass("NSString"))), objc.sel("stringWithUTF8String:"), .{
        @as([*:0]const u8, "gemra"),
    });
    objc.msgSendVoid(win, objc.sel("setTitle:"), .{title});

    const view_cls = createViewClass();
    const view = objc.msgSend(objc.id, objc.alloc(view_cls), objc.sel("initWithFrame:"), .{frame});

    const layer = objc.allocInit("CAMetalLayer");

    const device = ctx.renderer.device;
    objc.msgSendVoid(layer, objc.sel("setDevice:"), .{device});
    objc.msgSendVoid(layer, objc.sel("setPixelFormat:"), .{@as(u64, 80)}); // MTLPixelFormatBGRA8Unorm
    objc.msgSendVoid(layer, objc.sel("setFramebufferOnly:"), .{objc.YES});

    // Account for Retina scaling
    const scale_factor = objc.msgSend(objc.CGFloat, win, objc.sel("backingScaleFactor"), .{});
    objc.msgSendVoid(layer, objc.sel("setContentsScale:"), .{scale_factor});

    const scaled_width = 800.0 * scale_factor;
    const scaled_height = 600.0 * scale_factor;
    const layer_size = objc.CGSize{ .width = scaled_width, .height = scaled_height };
    objc.msgSendVoid(layer, objc.sel("setDrawableSize:"), .{layer_size});

    objc.msgSendVoid(view, objc.sel("setLayer:"), .{layer});
    objc.msgSendVoid(view, objc.sel("setWantsLayer:"), .{objc.YES});

    ctx.layer = layer;

    // Update renderer viewport to match physical pixel size
    ctx.renderer.updateViewport(@floatCast(scaled_width), @floatCast(scaled_height));

    objc.msgSendVoid(win, objc.sel("setContentView:"), .{view});
    objc.msgSendVoid(win, objc.sel("makeFirstResponder:"), .{view});

    // Set delegate as window delegate for focus events
    objc.msgSendVoid(win, objc.sel("setDelegate:"), .{delegate_obj});

    objc.msgSendVoid(win, objc.sel("makeKeyAndOrderFront:"), .{@as(objc.id, null)});
    objc.msgSendVoid(win, objc.sel("center"), .{});

    // Timer for rendering at ~60fps (use common modes so it fires during live resize)
    const timer = objc.msgSend(objc.id, @as(objc.id, @ptrCast(objc.getClass("NSTimer"))), objc.sel("timerWithTimeInterval:target:selector:userInfo:repeats:"), .{
        @as(f64, 1.0 / 60.0),
        delegate_obj,
        objc.sel("timerFired:"),
        @as(objc.id, null),
        objc.YES,
    });
    const run_loop = objc.msgSend(objc.id, @as(objc.id, @ptrCast(objc.getClass("NSRunLoop"))), objc.sel("currentRunLoop"), .{});
    const common_modes = objc.msgSend(objc.id, @as(objc.id, @ptrCast(objc.getClass("NSString"))), objc.sel("stringWithUTF8String:"), .{
        @as([*:0]const u8, "kCFRunLoopCommonModes"),
    });
    objc.msgSendVoid(run_loop, objc.sel("addTimer:forMode:"), .{ timer, common_modes });
}

pub fn runApp() void {
    objc.msgSendVoid(sharedApp(), objc.sel("run"), .{});
}
