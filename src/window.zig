const std = @import("std");
const posix = std.posix;
const objc = @import("objc.zig");
const terminal = @import("terminal.zig");
const Renderer = @import("renderer.zig").Renderer;
const input = @import("input.zig");
const GlobalState = @import("global_state.zig").GlobalState;

var global_state: ?*GlobalState = null;

// Click tracking for double/triple click detection in terminal area
var last_click_time: i128 = 0;
var last_click_col: u16 = 0;
var last_click_row: u16 = 0;
var click_count: u8 = 0;
const multi_click_threshold_ns: i128 = 400 * std.time.ns_per_ms;

pub fn sharedApp() objc.id {
    return objc.msgSend(objc.id, @as(objc.id, @ptrCast(objc.getClass("NSApplication"))), objc.sel("sharedApplication"), .{});
}

// Helper: convert mouse pixel location to terminal grid coordinates, accounting for tab bar
// Returns null if point is in tab bar or outside terminal area.
fn pixelToGrid(self_view: objc.id, event: objc.id, ctx: *GlobalState) ?terminal.Selection.GridPoint {
    const location = objc.msgSend(objc.CGPoint, event, objc.sel("locationInWindow"), .{});
    const view_loc = objc.msgSend(objc.CGPoint, self_view, objc.sel("convertPoint:fromView:"), .{
        location, @as(objc.id, null),
    });

    // Check if click is in tab bar
    const scaled_tab_height = ctx.tab_height * ctx.scale;
    if (view_loc.y < scaled_tab_height) {
        return null; // Click in tab bar
    }

    // Get view bounds to flip Y (AppKit is bottom-up, terminal is top-down)
    const view_bounds = objc.msgSend(objc.CGRect, self_view, objc.sel("bounds"), .{});
    const flipped_y = view_bounds.size.height - view_loc.y;

    // Convert to physical pixels, then to grid coordinates
    const pad_x = Renderer.padding_x * ctx.scale;
    const pad_y = Renderer.padding_y * ctx.scale;
    const cell_w = ctx.renderer.atlas.cell_width;
    const cell_h = ctx.renderer.atlas.cell_height;

    const px: f32 = @as(f32, @floatCast(view_loc.x)) * ctx.scale;
    const py: f32 = @as(f32, @floatCast(flipped_y)) * ctx.scale;

    const col_f = (px - pad_x) / cell_w;
    const row_f = (py - pad_y - scaled_tab_height) / cell_h;

    const term_cols: u16 = ctx.cols;
    const term_rows: u16 = ctx.rows;

    const col: u16 = if (col_f < 0) 0 else @min(@as(u16, @intFromFloat(col_f)), term_cols -| 1);
    const row: u16 = if (row_f < 0) 0 else @min(@as(u16, @intFromFloat(row_f)), term_rows -| 1);

    return .{ .col = col, .row = row };
}

fn handlePaste(ctx: *GlobalState) void {
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

    const active_tab = ctx.getActiveTab() orelse return;
    const pty_fd = active_tab.pty.master_fd;

    // Encode paste with simple mode for now (future: per-tab paste options)
    const result = input.encodePaste(data, .{ .bracketed = false }) catch return;

    // Write all parts to PTY
    if (result[0].len > 0) _ = posix.write(pty_fd, result[0]) catch {};
    if (result[1].len > 0) _ = posix.write(pty_fd, result[1]) catch {};
    if (result[2].len > 0) _ = posix.write(pty_fd, result[2]) catch {};
}

fn handleCopy(ctx: *GlobalState) void {
    const active_tab = ctx.getActiveTab() orelse return;

    active_tab.mutex.lock();
    defer active_tab.mutex.unlock();

    const sel_text = if (active_tab.term.selection) |sel| blk: {
        if (!sel.active) break :blk null;
        // Use the allocator from the tab's terminal (Terminal stores its allocator)
        break :blk sel.extractText(&active_tab.term.render_state, active_tab.term.allocator) catch null;
    } else null;

    if (sel_text) |text| {
        defer active_tab.term.allocator.free(text);
        copyToClipboard(text);
        // Clear selection after copy
        active_tab.term.selection = null;
        ctx.render_needed.store(true, .release);
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

fn viewKeyDown(_: objc.id, _: objc.SEL, event: objc.id) callconv(.c) void {
    const ctx = global_state orelse return;
    ctx.global_mutex.lock();
    defer ctx.global_mutex.unlock();
    const active_tab = ctx.getActiveTab() orelse return;

    const flags = objc.msgSend(u64, event, objc.sel("modifierFlags"), .{});
    const cmd = (flags & (1 << 20)) != 0;
    const key_code = objc.msgSend(u16, event, objc.sel("keyCode"), .{});

    const chars = objc.msgSend(objc.id, event, objc.sel("characters"), .{});
    const char_val: u16 = if (chars != null and objc.msgSend(u64, chars, objc.sel("length"), .{}) > 0)
        objc.msgSend(u16, chars, objc.sel("characterAtIndex:"), .{@as(u64, 0)})
    else
        0;

    // Handle paste/copy first (Cmd+V/Cmd+C)
    if (cmd and (char_val == 'v' or char_val == 'V')) {
        handlePaste(ctx);
        return;
    }

    if (cmd and (char_val == 'c' or char_val == 'C')) {
        handleCopy(ctx);
        return;
    }

    // Tab management shortcuts (use Cmd/Ctrl+key)
    if (cmd) {
        // Cmd+T: new tab
        if (char_val == 't' or char_val == 'T') {
            ctx.addTab(ctx.cols, ctx.rows) catch {};
            return;
        }

        // Cmd+W: close tab
        if (char_val == 'w' or char_val == 'W') {
            _ = ctx.closeActiveTab();
            return;
        }

        // Cmd+Shift+]: next tab
        // Check for ] key (keycode 27 or char ']')
        if (char_val == ']') {
            ctx.tab_manager.next();
            ctx.switchToTab(ctx.tab_manager.active_index);
            return;
        }

        // Cmd+Shift+[: prev tab
        if (char_val == '[') {
            ctx.tab_manager.prev();
            ctx.switchToTab(ctx.tab_manager.active_index);
            return;
        }

        // Cmd+1 through Cmd+9: direct tab selection
        if (char_val >= '1' and char_val <= '9') {
            const target_index = @as(usize, @intCast(char_val - '1'));
            if (target_index < ctx.tab_manager.len()) {
                ctx.switchToTab(target_index);
            }
            return;
        }
    }

    // Ignore other Cmd+ shortcuts (let system handle them)
    if (cmd) return;

    // Normal key: route to active tab's PTY
    const key = input.keyFromMacKeycode(key_code);

    // Get UTF-8 text from the event, filtering Apple private-use codepoints
    var utf8_buf: [32]u8 = undefined;
    var utf8_len: usize = 0;
    if (chars != null) {
        const raw_utf8 = objc.msgSend(?[*:0]const u8, chars, objc.sel("UTF8String"), .{});
        if (raw_utf8) |s| {
            var i: usize = 0;
            while (s[i] != 0 and utf8_len < utf8_buf.len) {
                const byte = s[i];
                if (byte < 0x80) {
                    utf8_buf[utf8_len] = byte;
                    utf8_len += 1;
                    i += 1;
                } else {
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
                        i += seq_len;
                        continue;
                    }
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
        if (uc < 0xF700 or uc > 0xF8FF) {
            unshifted_codepoint = @intCast(uc);
        }
    }

    // Build mods
    const mods = input.modsFromNSEventFlags(flags);

    // macOS pre-translates Ctrl+key
    if (mods.ctrl and utf8_len == 1 and utf8_buf[0] < 0x20) {
        if (unmod_chars != null) {
            const unmod_utf8 = objc.msgSend(?[*:0]const u8, unmod_chars, objc.sel("UTF8String"), .{});
            if (unmod_utf8) |s| {
                utf8_len = 0;
                var j: usize = 0;
                while (s[j] != 0 and utf8_len < utf8_buf.len) : (j += 1) {
                    utf8_buf[utf8_len] = s[j];
                    utf8_len += 1;
                }
            }
        }
    }

    var consumed_mods: input.KeyMods = .{};
    if (mods.shift and utf8_len > 0) {
        consumed_mods.shift = true;
    }

    const key_event: input.KeyEvent = .{
        .key = key,
        .mods = mods,
        .consumed_mods = consumed_mods,
        .utf8 = utf8_buf[0..utf8_len],
        .unshifted_codepoint = unshifted_codepoint,
        .action = .press,
    };

    // Get encoding options from terminal state (lock active tab)
    active_tab.mutex.lock();
    defer active_tab.mutex.unlock();
    const opts = input.KeyEncodeOptions.fromTerminal(&active_tab.term.inner);

    var enc_buf: [128]u8 = undefined;
    var writer: std.Io.Writer = .fixed(&enc_buf);
    input.encodeKey(&writer, key_event, opts) catch return;
    const encoded = writer.buffered();

    if (encoded.len > 0) {
        _ = active_tab.pty.write(encoded) catch {};
    }
}

// Helper: which tab is under the mouse? (uses x coordinate only for now)
// Returns index of tab, or null if outside tab bar.
fn tabIndexAtPoint(ctx: *GlobalState, x: f32) ?usize {
    const scaled_tab_width_min: f32 = 100.0 * ctx.scale; // Minimum tab width
    const total_tabs = ctx.tab_manager.len();
    if (total_tabs == 0) return null;

    const view_w = ctx.view_width;
    // Simple equal-width tabs for now
    const tab_w = @max(scaled_tab_width_min, view_w / @as(f32, @floatFromInt(total_tabs)));
    const scaled_padding = ctx.tab_padding * ctx.scale;
    const effective_tab_w = tab_w - 2 * scaled_padding;

    var x_cursor: f32 = 0;
    var i: usize = 0;
    while (i < total_tabs) : (i += 1) {
        const tab_left = x_cursor + scaled_padding;
        const tab_right = tab_left + effective_tab_w;
        if (x >= tab_left and x < tab_right) {
            return i;
        }
        x_cursor += tab_w;
    }
    return null;
}

// Helper: check if mouse is over close button for a given tab index
fn closeButtonHitTest(ctx: *GlobalState, tab_index: usize, x: f32, y: f32) bool {
    const total_tabs = ctx.tab_manager.len();
    if (tab_index >= total_tabs) return false;

    const scaled_tab_width_min: f32 = 100.0 * ctx.scale;
    const view_w = ctx.view_width;
    const tab_w = @max(scaled_tab_width_min, view_w / @as(f32, @floatFromInt(total_tabs)));
    const scaled_tab_height = ctx.tab_height * ctx.scale;

    const scaled_padding = ctx.tab_padding * ctx.scale;
    const tab_x = @as(f32, @floatFromInt(tab_index)) * tab_w + scaled_padding;
    const tab_y = scaled_padding;
    const effective_tab_w = tab_w - 2 * scaled_padding;

    // Close button: right side of tab, square
    const close_size = ctx.tab_close_size * ctx.scale;
    const close_x = tab_x + effective_tab_w - close_size - scaled_padding;
    const close_y = tab_y + (scaled_tab_height - close_size) / 2;

    return (x >= close_x and x < close_x + close_size and
        y >= close_y and y < close_y + close_size);
}

fn viewMouseDown(self_view: objc.id, _: objc.SEL, event: objc.id) callconv(.c) void {
    const ctx = global_state orelse return;
    const location = objc.msgSend(objc.CGPoint, event, objc.sel("locationInWindow"), .{});
    const view_loc = objc.msgSend(objc.CGPoint, self_view, objc.sel("convertPoint:fromView:"), .{
        location, @as(objc.id, null),
    });

    // Check if click is in tab bar
    const scaled_tab_height = ctx.tab_height * ctx.scale;
    if (view_loc.y < scaled_tab_height) {
        // Tab bar click
        if (tabIndexAtPoint(ctx, @floatCast(view_loc.x))) |tab_idx| {
            // Check if click is on close button
            if (closeButtonHitTest(ctx, tab_idx, @floatCast(view_loc.x), @floatCast(view_loc.y))) {
                // Close this tab
                ctx.global_mutex.lock();
                defer ctx.global_mutex.unlock();
                _ = ctx.closeActiveTab();
                // Note: after close, active tab changed; we handled it
            } else {
                // Switch to this tab
                ctx.global_mutex.lock();
                defer ctx.global_mutex.unlock();
                ctx.switchToTab(tab_idx);
            }
        }
        return;
    }

    // Otherwise, handle terminal mouse click
    if (pixelToGrid(self_view, event, ctx)) |point| {
        const flags = objc.msgSend(u64, event, objc.sel("modifierFlags"), .{});
        const mods = input.modsFromNSEventFlags(flags);

        // Check if mouse reporting is active for the active tab
        const active_tab = ctx.getActiveTab() orelse return;
        active_tab.mutex.lock();
        const mode = input.mouseMode(&active_tab.term.inner);
        active_tab.mutex.unlock();

        if (mode != .none) {
            // Report mouse press to terminal
            input.writeMouseEvent(active_tab.pty.master_fd, &active_tab.term.inner, 0, point.col, point.row, false, false, mods);
            return;
        }

        // Selection handling
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

        active_tab.mutex.lock();
        defer active_tab.mutex.unlock();

        const term_cols: u16 = @as(u16, @intCast(active_tab.term.inner.cols));

        switch (click_count) {
            2 => {
                const bounds = active_tab.term.wordBounds(point.col, point.row);
                active_tab.term.selection = terminal.Selection{
                    .anchor = .{ .col = bounds.start, .row = point.row },
                    .endpoint = .{ .col = bounds.end, .row = point.row },
                    .active = true,
                    .mode = .word,
                    .rectangle = false,
                };
            },
            3 => {
                active_tab.term.selection = terminal.Selection{
                    .anchor = .{ .col = 0, .row = point.row },
                    .endpoint = .{ .col = term_cols -| 1, .row = point.row },
                    .active = true,
                    .mode = .line,
                    .rectangle = false,
                };
            },
            else => {
                active_tab.term.selection = terminal.Selection{
                    .anchor = point,
                    .endpoint = point,
                    .active = true,
                    .mode = .normal,
                    .rectangle = alt,
                };
            },
        }

        ctx.render_needed.store(true, .release);
    }
}

fn viewMouseDragged(self_view: objc.id, _: objc.SEL, event: objc.id) callconv(.c) void {
    const ctx = global_state orelse return;

    // Check if drag started in tab bar (shouldn't happen, but ignore)
    const location = objc.msgSend(objc.CGPoint, event, objc.sel("locationInWindow"), .{});
    const view_loc = objc.msgSend(objc.CGPoint, self_view, objc.sel("convertPoint:fromView:"), .{
        location, @as(objc.id, null),
    });
    const scaled_tab_height = ctx.tab_height * ctx.scale;
    if (view_loc.y < scaled_tab_height) return; // Ignore drags in tab bar for now

    if (pixelToGrid(self_view, event, ctx)) |point| {
        const flags = objc.msgSend(u64, event, objc.sel("modifierFlags"), .{});
        const mods = input.modsFromNSEventFlags(flags);

        const active_tab = ctx.getActiveTab() orelse return;
        active_tab.mutex.lock();
        defer active_tab.mutex.unlock();

        const term_cols: u16 = @as(u16, @intCast(active_tab.term.inner.cols));
        const mode = input.mouseMode(&active_tab.term.inner);

        if (mode == .button or mode == .any) {
            input.writeMouseEvent(active_tab.pty.master_fd, &active_tab.term.inner, 0, point.col, point.row, false, true, mods);
            return;
        }

        // Selection handling
        if (active_tab.term.selection) |*sel| {
            switch (sel.mode) {
                .word => {
                    const bounds = active_tab.term.wordBounds(point.col, point.row);
                    const anchor_bounds = active_tab.term.wordBounds(sel.anchor.col, sel.anchor.row);
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

            ctx.render_needed.store(true, .release);
        }
    }
}

fn viewMouseUp(self_view: objc.id, _: objc.SEL, event: objc.id) callconv(.c) void {
    const ctx = global_state orelse return;
    const active_tab = ctx.getActiveTab() orelse return;

    active_tab.mutex.lock();
    defer active_tab.mutex.unlock();

    const mode = input.mouseMode(&active_tab.term.inner);

    if (mode != .none and mode != .x10) {
        if (pixelToGrid(self_view, event, ctx)) |point| {
            const flags = objc.msgSend(u64, event, objc.sel("modifierFlags"), .{});
            const mods = input.modsFromNSEventFlags(flags);
            input.writeMouseEvent(active_tab.pty.master_fd, &active_tab.term.inner, 0, point.col, point.row, true, false, mods);
        }
        return;
    }

    // Selection handling
    if (active_tab.term.selection) |sel| {
        if (sel.anchor.col == sel.endpoint.col and sel.anchor.row == sel.endpoint.row and sel.mode == .normal) {
            active_tab.term.selection = null;
            ctx.render_needed.store(true, .release);
        }
    }
}

fn viewRightMouseDown(self_view: objc.id, _: objc.SEL, event: objc.id) callconv(.c) void {
    const ctx = global_state orelse return;
    const active_tab = ctx.getActiveTab() orelse return;

    active_tab.mutex.lock();
    defer active_tab.mutex.unlock();

    const mode = input.mouseMode(&active_tab.term.inner);

    if (mode != .none) {
        if (pixelToGrid(self_view, event, ctx)) |point| {
            const flags = objc.msgSend(u64, event, objc.sel("modifierFlags"), .{});
            const mods = input.modsFromNSEventFlags(flags);
            input.writeMouseEvent(active_tab.pty.master_fd, &active_tab.term.inner, 2, point.col, point.row, false, false, mods);
        }
    }
}

fn viewRightMouseUp(self_view: objc.id, _: objc.SEL, event: objc.id) callconv(.c) void {
    const ctx = global_state orelse return;
    const active_tab = ctx.getActiveTab() orelse return;

    active_tab.mutex.lock();
    defer active_tab.mutex.unlock();

    const mode = input.mouseMode(&active_tab.term.inner);

    if (mode != .none and mode != .x10) {
        if (pixelToGrid(self_view, event, ctx)) |point| {
            const flags = objc.msgSend(u64, event, objc.sel("modifierFlags"), .{});
            const mods = input.modsFromNSEventFlags(flags);
            input.writeMouseEvent(active_tab.pty.master_fd, &active_tab.term.inner, 2, point.col, point.row, true, false, mods);
        }
    }
}

fn viewScrollWheel(_: objc.id, _: objc.SEL, event: objc.id) callconv(.c) void {
    const ctx = global_state orelse return;
    const active_tab = ctx.getActiveTab() orelse return;

    active_tab.mutex.lock();
    defer active_tab.mutex.unlock();

    const mode = input.mouseMode(&active_tab.term.inner);
    if (mode == .none) return;

    const delta_y = objc.msgSend(objc.CGFloat, event, objc.sel("scrollingDeltaY"), .{});
    if (delta_y == 0.0) return;

    const base_button: u8 = if (delta_y > 0.0) 64 else 65;

    // Get point for scroll position (we'll use the current mouse location if possible)
    const self_view = objc.msgSend(objc.id, event, objc.sel("responder"), .{});
    if (self_view == null) return;
    // We'll use a simplified approach: scroll at current cursor position if we could get it
    // For now, assume middle-left of terminal to avoid needing another pixelToGrid call
    const point = terminal.Selection.GridPoint{
        .col = ctx.cols / 2,
        .row = ctx.rows / 2,
    };

    const mods = input.modsFromNSEventFlags(0);

    const abs_delta = @abs(delta_y);
    const count: usize = @max(1, @as(usize, @intFromFloat(@min(abs_delta, 5.0))));
    var i: usize = 0;
    while (i < count) : (i += 1) {
        input.writeMouseEvent(active_tab.pty.master_fd, &active_tab.term.inner, base_button, point.col, point.row, false, false, mods);
    }
}

fn viewSetFrameSize(self_view: objc.id, _sel: objc.SEL, new_size: objc.CGSize) callconv(.c) void {
    // Call super's setFrameSize:
    const super = objc.Super{
        .receiver = self_view,
        .super_class = objc.getClass("NSView"),
    };
    objc.msgSendSuper(void, &super, _sel, .{new_size});

    const ctx = global_state orelse return;

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

    // Calculate new grid dimensions (account for tab bar)
    const scaled_tab_height = ctx.tab_height * scale;
    const pad_x = Renderer.padding_x * ctx.scale;
    const pad_y = Renderer.padding_y * ctx.scale;
    const cell_w = ctx.renderer.atlas.cell_width;
    const cell_h = ctx.renderer.atlas.cell_height;

    const usable_w: f32 = @floatCast(scaled_w - 2.0 * pad_x);
    // Subtract tab bar height from usable height
    const usable_h: f32 = @floatCast(scaled_h - scaled_tab_height - 2.0 * pad_y);
    if (usable_w <= 0 or usable_h <= 0) return;

    const new_cols: u16 = @intFromFloat(@floor(usable_w / cell_w));
    const new_rows: u16 = @intFromFloat(@floor(usable_h / cell_h));
    if (new_cols < 1 or new_rows < 1) return;

    if (new_cols != ctx.cols or new_rows != ctx.rows) {
        ctx.resizeTabs(new_cols, new_rows);
    }

    ctx.updateViewport(@floatCast(scaled_w), @floatCast(scaled_h));
    ctx.updateScale(@floatCast(scale));

    ctx.render_needed.store(true, .release);
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

fn delegateShouldTerminate(_: objc.id, _: objc.SEL, _: objc.id) callconv(.c) objc.BOOL {
    return objc.YES;
}

fn delegateDidFinishLaunching(_: objc.id, _: objc.SEL, _: objc.id) callconv(.c) void {
    objc.msgSendVoid(sharedApp(), objc.sel("activateIgnoringOtherApps:"), .{objc.YES});
}

fn delegateWindowDidBecomeKey(_: objc.id, _: objc.SEL, _: objc.id) callconv(.c) void {
    const ctx = global_state orelse return;
    const active_tab = ctx.getActiveTab() orelse return;

    active_tab.mutex.lock();
    defer active_tab.mutex.unlock();

    const focus_mode = active_tab.term.inner.modes.get(.focus_event);
    if (focus_mode) {
        _ = active_tab.pty.write("\x1b[I") catch {};
    }
}

fn delegateWindowDidResignKey(_: objc.id, _: objc.SEL, _: objc.id) callconv(.c) void {
    const ctx = global_state orelse return;
    const active_tab = ctx.getActiveTab() orelse return;

    active_tab.mutex.lock();
    defer active_tab.mutex.unlock();

    const focus_mode = active_tab.term.inner.modes.get(.focus_event);
    if (focus_mode) {
        _ = active_tab.pty.write("\x1b[O") catch {};
    }
}

fn delegateTimerFired(_: objc.id, _: objc.SEL, _: objc.id) callconv(.c) void {
    const ctx = global_state orelse return;
    if (!ctx.render_needed.load(.acquire)) return;

    ctx.global_mutex.lock();
    const active_tab = ctx.getActiveTab() orelse {
        ctx.global_mutex.unlock();
        return;
    };

    // Lock the active tab's mutex for rendering
    active_tab.mutex.lock();
    defer {
        active_tab.mutex.unlock();
        ctx.global_mutex.unlock();
    }

    // Update render state from terminal
    active_tab.term.updateRenderState() catch {};

    // Render tab bar first, then terminal
    renderTabBar(ctx);

    // Render terminal content
    ctx.renderer.render(active_tab.term, ctx.layer);
    ctx.render_needed.store(false, .release);
}

/// Renders a simple tab bar at the top of the viewport.
fn renderTabBar(ctx: *GlobalState) void {
    _ = ctx;
    // Stub: tab bar rendering not yet implemented
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

pub fn setup(ctx: *GlobalState) !void {
    global_state = ctx;

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

    const scale_factor = objc.msgSend(objc.CGFloat, win, objc.sel("backingScaleFactor"), .{});
    objc.msgSendVoid(layer, objc.sel("setContentsScale:"), .{scale_factor});

    const scaled_width = 800.0 * scale_factor;
    const scaled_height = 600.0 * scale_factor;
    const layer_size = objc.CGSize{ .width = scaled_width, .height = scaled_height };
    objc.msgSendVoid(layer, objc.sel("setDrawableSize:"), .{layer_size});

    objc.msgSendVoid(view, objc.sel("setLayer:"), .{layer});
    objc.msgSendVoid(view, objc.sel("setWantsLayer:"), .{objc.YES});

    ctx.layer = layer;

    ctx.renderer.updateViewport(@floatCast(scaled_width), @floatCast(scaled_height));

    objc.msgSendVoid(win, objc.sel("setContentView:"), .{view});
    objc.msgSendVoid(win, objc.sel("makeFirstResponder:"), .{view});

    objc.msgSendVoid(win, objc.sel("setDelegate:"), .{delegate_obj});

    objc.msgSendVoid(win, objc.sel("makeKeyAndOrderFront:"), .{@as(objc.id, null)});
    objc.msgSendVoid(win, objc.sel("center"), .{});

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

// Unused, but kept for future extension
fn viewFlagsChanged(_: objc.id, _: objc.SEL, _: objc.id) callconv(.c) void {}
