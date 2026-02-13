const std = @import("std");
const View = @import("../view.zig").View;
const Rect = @import("../view.zig").Rect;
const InputEvent = @import("../view.zig").InputEvent;
const Renderer = @import("../renderer.zig").Renderer;
const terminal = @import("../terminal.zig");
const Pty = @import("../pty.zig").Pty;

/// Wraps the existing terminal as a View for layout management
pub const TerminalView = struct {
    view: View,
    term: *terminal.Terminal,
    allocator: std.mem.Allocator,

    const vtable = View.VTable{
        .render = render,
        .handleInput = handleInput,
        .update = update,
        .deinit = deinit,
    };

    pub fn init(allocator: std.mem.Allocator, term: *terminal.Terminal) !*TerminalView {
        const self = try allocator.create(TerminalView);
        self.* = .{
            .view = .{ .vtable = &vtable },
            .term = term,
            .allocator = allocator,
        };
        return self;
    }

    fn render(view: *View, renderer: *Renderer, rect: Rect) void {
        const self: *TerminalView = @fieldParentPtr("view", view);
        _ = rect; // TODO Phase 2: Add rect clipping

        // Use existing terminal rendering
        renderer.buildVertices(self.term);
    }

    fn handleInput(view: *View, event: InputEvent) bool {
        _ = view;
        _ = event;
        // For Phase 1, let window.zig handle input as before
        // Phase 2 will route input through the view properly
        return false;
    }

    fn update(view: *View) void {
        const self: *TerminalView = @fieldParentPtr("view", view);
        // Update terminal render state
        self.term.updateRenderState() catch {};
    }

    fn deinit(view: *View) void {
        const self: *TerminalView = @fieldParentPtr("view", view);
        // Don't deallocate term or pty, they're owned by main
        self.allocator.destroy(self);
    }
};
