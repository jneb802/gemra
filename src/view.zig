const std = @import("std");
const Renderer = @import("renderer.zig").Renderer;

/// Core abstraction for polymorphic views (terminal, file tree, editor)
pub const View = struct {
    vtable: *const VTable,

    pub const VTable = struct {
        render: *const fn (*View, *Renderer, Rect) void,
        handleInput: *const fn (*View, InputEvent) bool,
        update: *const fn (*View) void,
        deinit: *const fn (*View) void,
    };

    pub fn render(self: *View, renderer: *Renderer, rect: Rect) void {
        self.vtable.render(self, renderer, rect);
    }

    pub fn handleInput(self: *View, event: InputEvent) bool {
        return self.vtable.handleInput(self, event);
    }

    pub fn update(self: *View) void {
        self.vtable.update(self);
    }

    pub fn deinit(self: *View) void {
        self.vtable.deinit(self);
    }
};

/// Rectangle defining a view's rendering area
pub const Rect = struct {
    x: f32,
    y: f32,
    width: f32,
    height: f32,

    pub fn contains(self: Rect, px: f32, py: f32) bool {
        return px >= self.x and px < self.x + self.width and
            py >= self.y and py < self.y + self.height;
    }

    pub fn split_vertical(self: Rect, ratio: f32) struct { left: Rect, right: Rect } {
        const split_x = self.x + self.width * ratio;
        return .{
            .left = .{
                .x = self.x,
                .y = self.y,
                .width = self.width * ratio,
                .height = self.height,
            },
            .right = .{
                .x = split_x,
                .y = self.y,
                .width = self.width * (1.0 - ratio),
                .height = self.height,
            },
        };
    }

    pub fn split_horizontal(self: Rect, ratio: f32) struct { top: Rect, bottom: Rect } {
        const split_y = self.y + self.height * ratio;
        return .{
            .top = .{
                .x = self.x,
                .y = self.y,
                .width = self.width,
                .height = self.height * ratio,
            },
            .bottom = .{
                .x = self.x,
                .y = split_y,
                .width = self.width,
                .height = self.height * (1.0 - ratio),
            },
        };
    }
};

/// Input events that views can handle
pub const InputEvent = union(enum) {
    key: struct {
        keycode: u16,
        modifiers: u64,
        chars: ?[32]u8,
        chars_len: usize,
    },
    mouse_down: struct {
        col: u16,
        row: u16,
    },
    mouse_dragged: struct {
        col: u16,
        row: u16,
    },
};
