const std = @import("std");
const ghostty = @import("ghostty-vt");
const posix = std.posix;

// Re-export types for renderer/window
pub const Color = ghostty.color.RGB;
pub const Style = ghostty.Style;
pub const PageCell = ghostty.page.Cell;
pub const RenderState = ghostty.RenderState;

pub const default_fg = Color{ .r = 200, .g = 200, .b = 200 };
pub const default_bg = Color{ .r = 30, .g = 30, .b = 30 };

// Extract the private ReadonlyHandler type from vtStream's return type
const ReadonlyVtStream = @typeInfo(@TypeOf(ghostty.Terminal.vtStream)).@"fn".return_type.?;
const ReadonlyHandler = @typeInfo(ReadonlyVtStream).@"struct".fields[0].type;

/// Custom handler that wraps ReadonlyHandler but responds to DA1/DSR queries
/// by writing responses back to the PTY.
const GemraHandler = struct {
    inner: ReadonlyHandler,
    pty_fd: posix.fd_t,

    fn init(terminal_inner: *ghostty.Terminal, pty_fd: posix.fd_t) GemraHandler {
        return .{
            .inner = .init(terminal_inner),
            .pty_fd = pty_fd,
        };
    }

    pub fn deinit(self: *GemraHandler) void {
        self.inner.deinit();
    }

    pub fn vt(
        self: *GemraHandler,
        comptime action: ghostty.StreamAction.Tag,
        value: ghostty.StreamAction.Value(action),
    ) !void {
        switch (action) {
            .device_attributes => {
                const response = switch (value) {
                    .primary => "\x1b[?62;22c", // VT220 with ANSI color
                    .secondary => "\x1b[>0;0;0c",
                    else => null,
                };
                if (response) |r| _ = posix.write(self.pty_fd, r) catch {};
            },
            .device_status => {
                self.handleDeviceStatus(value);
            },
            else => try self.inner.vt(action, value),
        }
    }

    fn handleDeviceStatus(self: *GemraHandler, value: ghostty.StreamAction.Value(.device_status)) void {
        const Request = @TypeOf(value.request);
        const req_int = @intFromEnum(value.request);

        if (req_int == @intFromEnum(@as(Request, .operating_status))) {
            _ = posix.write(self.pty_fd, "\x1b[0n") catch {};
        } else if (req_int == @intFromEnum(@as(Request, .cursor_position))) {
            const row = self.inner.terminal.screens.active.cursor.y + 1;
            const col = self.inner.terminal.screens.active.cursor.x + 1;
            var buf: [32]u8 = undefined;
            const response = std.fmt.bufPrint(&buf, "\x1b[{};{}R", .{ row, col }) catch return;
            _ = posix.write(self.pty_fd, response) catch {};
        }
    }
};

const GemraStream = ghostty.Stream(GemraHandler);

pub const Selection = struct {
    anchor: GridPoint,
    endpoint: GridPoint,
    active: bool = false,
    mode: Mode = .normal,
    rectangle: bool = false,

    pub const GridPoint = struct {
        col: u16,
        row: u16,
    };

    pub const Mode = enum { normal, word, line };

    pub fn ordered(self: Selection) struct { start: GridPoint, end: GridPoint } {
        if (self.anchor.row < self.endpoint.row or
            (self.anchor.row == self.endpoint.row and self.anchor.col <= self.endpoint.col))
        {
            return .{ .start = self.anchor, .end = self.endpoint };
        }
        return .{ .start = self.endpoint, .end = self.anchor };
    }

    pub fn contains(self: Selection, col: u16, row: u16) bool {
        if (!self.active) return false;
        const sel = self.ordered();
        if (self.rectangle) {
            const min_col = @min(self.anchor.col, self.endpoint.col);
            const max_col = @max(self.anchor.col, self.endpoint.col);
            return row >= sel.start.row and row <= sel.end.row and
                col >= min_col and col <= max_col;
        }
        if (row < sel.start.row or row > sel.end.row) return false;
        if (row == sel.start.row and row == sel.end.row) {
            return col >= sel.start.col and col <= sel.end.col;
        }
        if (row == sel.start.row) return col >= sel.start.col;
        if (row == sel.end.row) return col <= sel.end.col;
        return true;
    }

    pub fn extractText(self: Selection, rs: *const RenderState, allocator: std.mem.Allocator) ![]u8 {
        const sel = self.ordered();
        var result: std.ArrayListUnmanaged(u8) = .{};
        errdefer result.deinit(allocator);

        const row_slice = rs.row_data.slice();
        const cells_list = row_slice.items(.cells);
        const rs_rows: u16 = @intCast(cells_list.len);

        var row = sel.start.row;
        while (row <= sel.end.row and row < rs_rows) : (row += 1) {
            const raw_cells = cells_list[row].slice().items(.raw);
            const cols_count: u16 = @intCast(raw_cells.len);

            const start_col = if (row == sel.start.row) sel.start.col else 0;
            const end_col = if (row == sel.end.row) @min(sel.end.col, cols_count -| 1) else cols_count -| 1;

            const actual_start = if (self.rectangle) @min(self.anchor.col, self.endpoint.col) else start_col;
            const actual_end = if (self.rectangle) @min(@max(self.anchor.col, self.endpoint.col), cols_count -| 1) else end_col;

            // Find last non-space character to trim trailing whitespace
            var last_content = actual_start;
            var has_content = false;
            {
                var col = actual_start;
                while (col <= actual_end and col < cols_count) : (col += 1) {
                    const cp = raw_cells[col].codepoint();
                    if (cp > ' ' and cp != 127) {
                        last_content = col;
                        has_content = true;
                    }
                }
            }

            if (has_content) {
                var col = actual_start;
                while (col <= last_content) : (col += 1) {
                    const cp = raw_cells[col].codepoint();
                    var buf: [4]u8 = undefined;
                    const len = std.unicode.utf8Encode(cp, &buf) catch continue;
                    try result.appendSlice(allocator, buf[0..len]);
                }
            }

            if (row < sel.end.row) {
                try result.append(allocator, '\n');
            }
        }

        return try result.toOwnedSlice(allocator);
    }
};

fn isWordCodepoint(cp: u21) bool {
    if (cp <= ' ' or cp == 127) return false;
    const word_delimiters = " \t!\"#$%&'()*+,-./:;<=>?@[\\]^`{|}~";
    for (word_delimiters) |d| {
        if (cp == d) return false;
    }
    return true;
}

pub const Terminal = struct {
    inner: ghostty.Terminal,
    stream: ?GemraStream,
    render_state: RenderState,
    allocator: std.mem.Allocator,
    pty_fd: posix.fd_t,
    selection: ?Selection = null,

    pub fn init(alloc: std.mem.Allocator, cols: u16, rows: u16, pty_fd: posix.fd_t) !Terminal {
        const inner: ghostty.Terminal = try .init(alloc, .{
            .cols = cols,
            .rows = rows,
            .max_scrollback = 10_000,
            .colors = .{
                .background = .init(default_bg),
                .foreground = .init(default_fg),
                .cursor = .unset,
                .palette = .default,
            },
        });

        // Stream must NOT be created here — it captures &inner which moves on return.
        // Created lazily on first feed() call when struct is at its final address.
        return .{
            .inner = inner,
            .stream = null,
            .render_state = .empty,
            .allocator = alloc,
            .pty_fd = pty_fd,
        };
    }

    pub fn deinit(self: *Terminal) void {
        if (self.stream) |*s| s.deinit();
        self.render_state.deinit(self.allocator);
        self.inner.deinit(self.allocator);
    }

    pub fn feed(self: *Terminal, data: []const u8) void {
        if (self.stream == null) {
            self.stream = .initAlloc(self.allocator, GemraHandler.init(&self.inner, self.pty_fd));
        }
        self.stream.?.nextSlice(data) catch {};
    }

    pub fn resize(self: *Terminal, cols: u16, rows: u16) !void {
        try self.inner.resize(self.allocator, cols, rows);
    }

    pub fn updateRenderState(self: *Terminal) !void {
        try self.render_state.update(self.allocator, &self.inner);
    }

    pub fn wordBounds(self: *const Terminal, col: u16, row: u16) struct { start: u16, end: u16 } {
        const rs = &self.render_state;
        const row_slice = rs.row_data.slice();
        const cells_list = row_slice.items(.cells);

        if (row >= cells_list.len) return .{ .start = col, .end = col };

        const raw_cells = cells_list[row].slice().items(.raw);
        const cols_count: u16 = @intCast(raw_cells.len);

        if (col >= cols_count) return .{ .start = col, .end = col };

        if (!isWordCodepoint(raw_cells[col].codepoint())) {
            return .{ .start = col, .end = col };
        }

        var start = col;
        var end = col;
        while (start > 0 and isWordCodepoint(raw_cells[start - 1].codepoint())) {
            start -= 1;
        }
        while (end < cols_count - 1 and isWordCodepoint(raw_cells[end + 1].codepoint())) {
            end += 1;
        }
        return .{ .start = start, .end = end };
    }
};
