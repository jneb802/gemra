const std = @import("std");
const ghostty = @import("ghostty-vt");

// Re-export types for renderer/window
pub const Color = ghostty.color.RGB;
pub const Style = ghostty.Style;
pub const PageCell = ghostty.page.Cell;
pub const RenderState = ghostty.RenderState;

pub const default_fg = Color{ .r = 200, .g = 200, .b = 200 };
pub const default_bg = Color{ .r = 30, .g = 30, .b = 30 };

const VtStream = @typeInfo(@TypeOf(ghostty.Terminal.vtStream)).@"fn".return_type.?;

pub const Terminal = struct {
    inner: ghostty.Terminal,
    stream: ?VtStream,
    render_state: RenderState,
    allocator: std.mem.Allocator,

    pub fn init(alloc: std.mem.Allocator, cols: u16, rows: u16) !Terminal {
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
        };
    }

    pub fn deinit(self: *Terminal) void {
        if (self.stream) |*s| s.deinit();
        self.render_state.deinit(self.allocator);
        self.inner.deinit(self.allocator);
    }

    pub fn feed(self: *Terminal, data: []const u8) void {
        if (self.stream == null) {
            self.stream = self.inner.vtStream();
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
