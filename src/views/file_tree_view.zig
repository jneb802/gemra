const std = @import("std");
const View = @import("../view.zig").View;
const Rect = @import("../view.zig").Rect;
const InputEvent = @import("../view.zig").InputEvent;
const Renderer = @import("../renderer.zig").Renderer;
const FileTree = @import("../models/file_tree.zig").FileTree;

/// Renders file tree with icons, indentation, and selection
pub const FileTreeView = struct {
    view: View,
    model: FileTree,
    scroll_offset: usize,
    visible_lines: usize,
    allocator: std.mem.Allocator,
    cell_width: f32,
    cell_height: f32,

    const vtable = View.VTable{
        .render = render,
        .handleInput = handleInput,
        .update = update,
        .deinit = deinit,
    };

    // Visual constants
    const INDENT_PX: f32 = 16.0;
    const ICON_FOLDER = "📁";
    const ICON_FILE = "📄";
    const ICON_SYMLINK = "🔗";
    const INDICATOR_COLLAPSED = "▶";
    const INDICATOR_EXPANDED = "▼";

    // Colors
    const COLOR_TEXT_NORMAL = [4]f32{ 0.8, 0.8, 0.8, 1.0 };
    const COLOR_TEXT_SELECTED = [4]f32{ 1.0, 1.0, 1.0, 1.0 };
    const COLOR_SELECTION_BG = [4]f32{ 0.26, 0.47, 0.73, 1.0 };

    pub fn init(allocator: std.mem.Allocator, root_path: []const u8, cell_width: f32, cell_height: f32) !*FileTreeView {
        const self = try allocator.create(FileTreeView);
        errdefer allocator.destroy(self);

        const model = try FileTree.init(allocator, root_path);

        self.* = .{
            .view = .{ .vtable = &vtable },
            .model = model,
            .scroll_offset = 0,
            .visible_lines = 0,
            .allocator = allocator,
            .cell_width = cell_width,
            .cell_height = cell_height,
        };

        return self;
    }

    fn render(view: *View, renderer: *Renderer, rect: Rect) void {
        const self: *FileTreeView = @fieldParentPtr("view", view);

        // Calculate visible lines from rect height
        self.visible_lines = @intFromFloat(@max(1.0, rect.height / self.cell_height));

        // Get flat list of visible nodes
        var visible_nodes = self.model.getVisibleNodes(self.allocator) catch return;
        defer visible_nodes.deinit(self.allocator);

        // Render each visible line
        var y: f32 = rect.y;
        const start_idx = self.scroll_offset;
        const end_idx = @min(start_idx + self.visible_lines, visible_nodes.items.len);

        for (visible_nodes.items[start_idx..end_idx]) |node| {
            const depth = FileTree.getNodeDepth(node);
            const is_selected = if (self.model.selected_node) |sel| sel == node else false;

            self.renderLine(renderer, rect, y, node, depth, is_selected);
            y += self.cell_height;
        }
    }

    fn renderLine(
        self: *FileTreeView,
        renderer: *Renderer,
        rect: Rect,
        y: f32,
        node: *FileTree.TreeNode,
        depth: usize,
        selected: bool,
    ) void {
        var x: f32 = rect.x;

        // Selection background
        if (selected) {
            self.renderQuad(renderer, rect.x, y, rect.width, self.cell_height, COLOR_SELECTION_BG);
        }

        // Indentation
        x += INDENT_PX * @as(f32, @floatFromInt(depth));

        // Expand/collapse indicator for directories
        if (node.node_type == .directory) {
            const indicator = if (node.isExpanded(&self.model))
                INDICATOR_EXPANDED
            else
                INDICATOR_COLLAPSED;

            const color = if (selected) COLOR_TEXT_SELECTED else COLOR_TEXT_NORMAL;
            self.renderText(renderer, x, y, indicator, color);
            x += self.cell_width;
        } else {
            // Space for non-directories to align with directories
            x += self.cell_width;
        }

        // Icon
        const icon = switch (node.node_type) {
            .directory => ICON_FOLDER,
            .file => ICON_FILE,
            .symlink => ICON_SYMLINK,
        };
        const color = if (selected) COLOR_TEXT_SELECTED else COLOR_TEXT_NORMAL;
        self.renderText(renderer, x, y, icon, color);
        x += self.cell_width * 2; // Icons are wider

        // File/folder name
        self.renderText(renderer, x, y, node.name, color);
    }

    fn renderQuad(
        self: *FileTreeView,
        renderer: *Renderer,
        x: f32,
        y: f32,
        width: f32,
        height: f32,
        color: [4]f32,
    ) void {
        _ = self;
        _ = renderer;
        _ = x;
        _ = y;
        _ = width;
        _ = height;
        _ = color;
        // TODO: Implement using renderer's vertex buffer
        // For now, this is a placeholder
    }

    fn renderText(
        self: *FileTreeView,
        renderer: *Renderer,
        x: f32,
        y: f32,
        text: []const u8,
        color: [4]f32,
    ) void {
        _ = self;
        _ = renderer;
        _ = x;
        _ = y;
        _ = text;
        _ = color;
        // TODO: Implement using renderer's glyph atlas
        // For now, this is a placeholder
    }

    fn handleInput(view: *View, event: InputEvent) bool {
        const self: *FileTreeView = @fieldParentPtr("view", view);

        switch (event) {
            .key => |key_data| {
                // Check for arrow keys
                const keycode = key_data.keycode;

                // Arrow key codes on macOS:
                // 125 = Down, 126 = Up, 123 = Left, 124 = Right
                if (keycode == 125) { // Down
                    self.model.moveSelection(.down);
                    return true;
                } else if (keycode == 126) { // Up
                    self.model.moveSelection(.up);
                    return true;
                } else if (keycode == 123) { // Left
                    self.model.moveSelection(.left);
                    return true;
                } else if (keycode == 124) { // Right
                    self.model.moveSelection(.right);
                    return true;
                } else if (keycode == 36) { // Enter
                    // TODO Phase 3: Open file
                    if (self.model.selected_node) |node| {
                        std.debug.print("Would open: {s}\n", .{node.path});
                    }
                    return true;
                }
            },
            .mouse_down => |mouse_data| {
                // TODO: Handle mouse clicks on file tree items
                _ = mouse_data;
                return true;
            },
            else => {},
        }

        return false;
    }

    fn update(view: *View) void {
        _ = view;
        // File tree doesn't need regular updates
    }

    fn deinit(view: *View) void {
        const self: *FileTreeView = @fieldParentPtr("view", view);
        self.model.deinit();
        self.allocator.destroy(self);
    }
};
