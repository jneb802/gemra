const std = @import("std");
const View = @import("view.zig").View;
const Rect = @import("view.zig").Rect;
const InputEvent = @import("view.zig").InputEvent;
const Renderer = @import("renderer.zig").Renderer;

/// Manages pane splitting, focus, and layout rendering
pub const LayoutManager = struct {
    allocator: std.mem.Allocator,
    viewport: Rect,
    panes: std.ArrayList(Pane),
    active_pane: usize,
    next_id: u32,

    pub const Pane = struct {
        id: u32,
        rect: Rect,
        view: *View,
        dirty: bool,
    };

    pub fn init(allocator: std.mem.Allocator, viewport: Rect) !LayoutManager {
        var panes = std.ArrayList(Pane){};
        try panes.ensureTotalCapacity(allocator, 4);

        return LayoutManager{
            .allocator = allocator,
            .viewport = viewport,
            .panes = panes,
            .active_pane = 0,
            .next_id = 0,
        };
    }

    pub fn deinit(self: *LayoutManager) void {
        // Clean up all views
        for (self.panes.items) |*pane| {
            pane.view.deinit();
        }
        self.panes.deinit(self.allocator);
    }

    /// Add a pane with the view taking the full viewport
    pub fn addPane(self: *LayoutManager, view: *View) !u32 {
        const id = self.next_id;
        self.next_id += 1;

        try self.panes.append(self.allocator, .{
            .id = id,
            .rect = self.viewport,
            .view = view,
            .dirty = true,
        });

        return id;
    }

    /// Split a pane vertically at the given ratio (0.0 to 1.0)
    /// Creates a new pane on the right with the last added view
    pub fn splitVertical(self: *LayoutManager, pane_id: u32, ratio: f32) !void {
        const pane_idx = self.findPaneIndex(pane_id) orelse return error.PaneNotFound;

        if (self.panes.items.len < 2) return error.NotEnoughPanes;

        const old_rect = self.panes.items[pane_idx].rect;
        const split = old_rect.split_vertical(ratio);

        // Update existing pane (left)
        self.panes.items[pane_idx].rect = split.left;
        self.panes.items[pane_idx].dirty = true;

        // Update last pane (right) - assumes it was just added
        const last_idx = self.panes.items.len - 1;
        if (last_idx != pane_idx) {
            self.panes.items[last_idx].rect = split.right;
            self.panes.items[last_idx].dirty = true;
        }
    }

    /// Split a pane horizontally at the given ratio (0.0 to 1.0)
    pub fn splitHorizontal(self: *LayoutManager, pane_id: u32, ratio: f32) !void {
        const pane_idx = self.findPaneIndex(pane_id) orelse return error.PaneNotFound;

        if (self.panes.items.len < 2) return error.NotEnoughPanes;

        const old_rect = self.panes.items[pane_idx].rect;
        const split = old_rect.split_horizontal(ratio);

        // Update existing pane (top)
        self.panes.items[pane_idx].rect = split.top;
        self.panes.items[pane_idx].dirty = true;

        // Update last pane (bottom)
        const last_idx = self.panes.items.len - 1;
        if (last_idx != pane_idx) {
            self.panes.items[last_idx].rect = split.bottom;
            self.panes.items[last_idx].dirty = true;
        }
    }

    /// Close a pane and remove it from the layout
    pub fn closePane(self: *LayoutManager, pane_id: u32) void {
        const pane_idx = self.findPaneIndex(pane_id) orelse return;

        // Clean up the view
        self.panes.items[pane_idx].view.deinit();

        // Remove from list
        _ = self.panes.orderedRemove(pane_idx);

        // Adjust active pane if necessary
        if (self.active_pane >= self.panes.items.len and self.panes.items.len > 0) {
            self.active_pane = self.panes.items.len - 1;
        }

        // Recalculate layout for remaining panes
        if (self.panes.items.len == 1) {
            self.panes.items[0].rect = self.viewport;
            self.panes.items[0].dirty = true;
        }
    }

    /// Resize the viewport and proportionally resize all panes
    pub fn resize(self: *LayoutManager, new_viewport: Rect) void {
        const x_scale = new_viewport.width / self.viewport.width;
        const y_scale = new_viewport.height / self.viewport.height;

        for (self.panes.items) |*pane| {
            pane.rect.x *= x_scale;
            pane.rect.y *= y_scale;
            pane.rect.width *= x_scale;
            pane.rect.height *= y_scale;
            pane.dirty = true;
        }

        self.viewport = new_viewport;
    }

    /// Set the active pane by index
    pub fn setActivePane(self: *LayoutManager, index: usize) void {
        if (index < self.panes.items.len) {
            self.active_pane = index;
        }
    }

    /// Handle input event, routing to active pane
    pub fn handleInput(self: *LayoutManager, event: InputEvent) bool {
        if (self.panes.items.len == 0) return false;
        return self.panes.items[self.active_pane].view.handleInput(event);
    }

    /// Update all views
    pub fn update(self: *LayoutManager) void {
        for (self.panes.items) |*pane| {
            pane.view.update();
        }
    }

    /// Mark all panes as dirty (needs re-render)
    pub fn markAllDirty(self: *LayoutManager) void {
        for (self.panes.items) |*pane| {
            pane.dirty = true;
        }
    }

    /// Updates viewport and proportionally resizes all panes
    pub fn updateViewport(self: *LayoutManager, new_viewport: Rect) void {
        const old_vp = self.viewport;
        self.viewport = new_viewport;

        for (self.panes.items) |*pane| {
            const x_ratio = if (old_vp.width > 0) pane.rect.x / old_vp.width else 0;
            const y_ratio = if (old_vp.height > 0) pane.rect.y / old_vp.height else 0;
            const w_ratio = if (old_vp.width > 0) pane.rect.width / old_vp.width else 1;
            const h_ratio = if (old_vp.height > 0) pane.rect.height / old_vp.height else 1;

            pane.rect.x = x_ratio * new_viewport.width;
            pane.rect.y = y_ratio * new_viewport.height;
            pane.rect.width = w_ratio * new_viewport.width;
            pane.rect.height = h_ratio * new_viewport.height;
            pane.dirty = true;
        }
    }

    fn findPaneIndex(self: *LayoutManager, pane_id: u32) ?usize {
        for (self.panes.items, 0..) |pane, i| {
            if (pane.id == pane_id) return i;
        }
        return null;
    }
};
