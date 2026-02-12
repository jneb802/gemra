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

    fn init(terminal: *ghostty.Terminal, pty_fd: posix.fd_t) GemraHandler {
        return .{
            .inner = .init(terminal),
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

pub const Terminal = struct {
    inner: ghostty.Terminal,
    stream: ?GemraStream,
    render_state: RenderState,
    allocator: std.mem.Allocator,
    pty_fd: posix.fd_t,

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

    pub fn isDirty(self: *Terminal) bool {
        // Check terminal-level dirty flags
        const term_dirty: @typeInfo(ghostty.Terminal.Dirty).@"struct".backing_integer.? = @bitCast(self.inner.flags.dirty);
        if (term_dirty > 0) return true;

        // Check screen-level dirty flags
        const screen = self.inner.screens.active;
        const screen_dirty: @typeInfo(ghostty.Screen.Dirty).@"struct".backing_integer.? = @bitCast(screen.dirty);
        if (screen_dirty > 0) return true;

        return false;
    }
};
