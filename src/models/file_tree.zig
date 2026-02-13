const std = @import("std");

/// Hierarchical file system representation with lazy loading
pub const FileTree = struct {
    allocator: std.mem.Allocator,
    root: *TreeNode,
    selected_node: ?*TreeNode,
    expanded_nodes: std.AutoHashMap(*TreeNode, void),

    pub const NodeType = enum {
        file,
        directory,
        symlink,
    };

    pub const TreeNode = struct {
        name: []const u8,
        path: []const u8,
        node_type: NodeType,
        children: ?std.ArrayList(*TreeNode),
        parent: ?*TreeNode,
        allocator: std.mem.Allocator,

        pub fn deinit(self: *TreeNode) void {
            self.allocator.free(self.name);
            self.allocator.free(self.path);

            if (self.children) |*children_list| {
                for (children_list.items) |child| {
                    child.deinit();
                    self.allocator.destroy(child);
                }
                children_list.deinit(self.allocator);
            }
        }

        pub fn isExpanded(self: *const TreeNode, tree: *const FileTree) bool {
            return tree.expanded_nodes.contains(@constCast(self));
        }
    };

    pub const Direction = enum {
        up,
        down,
        left,
        right,
    };

    pub fn init(allocator: std.mem.Allocator, root_path: []const u8) !FileTree {
        const root = try allocator.create(TreeNode);

        // Get the last component of the path for display
        const name = std.fs.path.basename(root_path);

        root.* = .{
            .name = try allocator.dupe(u8, name),
            .path = try allocator.dupe(u8, root_path),
            .node_type = .directory,
            .children = null,
            .parent = null,
            .allocator = allocator,
        };

        var tree = FileTree{
            .allocator = allocator,
            .root = root,
            .selected_node = root,
            .expanded_nodes = std.AutoHashMap(*TreeNode, void).init(allocator),
        };

        // Automatically expand root
        try tree.expandNode(root);

        return tree;
    }

    pub fn deinit(self: *FileTree) void {
        self.root.deinit();
        self.allocator.destroy(self.root);
        self.expanded_nodes.deinit();
    }

    /// Toggle expansion state of a node
    pub fn toggleExpand(self: *FileTree, node: *TreeNode) !void {
        if (node.node_type != .directory) return;

        if (node.isExpanded(self)) {
            // Collapse
            _ = self.expanded_nodes.remove(node);
        } else {
            // Expand
            try self.expandNode(node);
        }
    }

    /// Expand a directory node (lazy load children)
    fn expandNode(self: *FileTree, node: *TreeNode) !void {
        if (node.node_type != .directory) return;

        // Load children if not already loaded
        if (node.children == null) {
            try self.loadChildren(node);
        }

        try self.expanded_nodes.put(node, {});
    }

    /// Load children for a directory node
    fn loadChildren(self: *FileTree, node: *TreeNode) !void {
        var children_list = std.ArrayList(*TreeNode){};
        try children_list.ensureTotalCapacity(self.allocator, 16);
        errdefer {
            for (children_list.items) |child| {
                child.deinit();
                self.allocator.destroy(child);
            }
            children_list.deinit(self.allocator);
        }

        var dir = std.fs.cwd().openDir(node.path, .{ .iterate = true }) catch |err| {
            std.log.warn("Failed to open directory {s}: {}", .{ node.path, err });
            node.children = children_list;
            return;
        };
        defer dir.close();

        var iterator = dir.iterate();
        while (try iterator.next()) |entry| {
            // Skip hidden files
            if (entry.name[0] == '.') continue;

            const child = try self.allocator.create(TreeNode);
            const child_path = try std.fs.path.join(self.allocator, &.{ node.path, entry.name });

            const node_type: NodeType = switch (entry.kind) {
                .directory => .directory,
                .sym_link => .symlink,
                else => .file,
            };

            child.* = .{
                .name = try self.allocator.dupe(u8, entry.name),
                .path = child_path,
                .node_type = node_type,
                .children = null,
                .parent = node,
                .allocator = self.allocator,
            };

            try children_list.append(self.allocator, child);
        }

        // Sort: directories first, then alphabetically
        std.mem.sort(*TreeNode, children_list.items, {}, compareNodes);

        node.children = children_list;
    }

    fn compareNodes(_: void, a: *TreeNode, b: *TreeNode) bool {
        // Directories come before files
        if (a.node_type == .directory and b.node_type != .directory) return true;
        if (a.node_type != .directory and b.node_type == .directory) return false;

        // Alphabetical within same type
        return std.mem.lessThan(u8, a.name, b.name);
    }

    /// Move selection in the specified direction
    pub fn moveSelection(self: *FileTree, direction: Direction) void {
        const current = self.selected_node orelse return;

        switch (direction) {
            .down => {
                self.selected_node = self.getNextVisibleNode(current);
            },
            .up => {
                self.selected_node = self.getPrevVisibleNode(current);
            },
            .right => {
                // Expand if directory and collapsed
                if (current.node_type == .directory) {
                    if (!current.isExpanded(self)) {
                        self.expandNode(current) catch return;
                    } else if (current.children) |children| {
                        // Move to first child if expanded
                        if (children.items.len > 0) {
                            self.selected_node = children.items[0];
                        }
                    }
                }
            },
            .left => {
                // Collapse if directory and expanded
                if (current.node_type == .directory and current.isExpanded(self)) {
                    _ = self.expanded_nodes.remove(current);
                } else if (current.parent) |parent| {
                    // Move to parent if not collapsible
                    self.selected_node = parent;
                }
            },
        }
    }

    fn getNextVisibleNode(self: *const FileTree, node: *const TreeNode) ?*TreeNode {
        // If expanded directory with children, go to first child
        if (node.node_type == .directory and node.isExpanded(self)) {
            if (node.children) |children| {
                if (children.items.len > 0) {
                    return children.items[0];
                }
            }
        }

        // Otherwise, go to next sibling or parent's next sibling
        var current = node;
        while (current.parent) |parent| {
            if (parent.children) |siblings| {
                // Find our index in parent's children
                for (siblings.items, 0..) |sibling, i| {
                    if (sibling == current) {
                        // Return next sibling if exists
                        if (i + 1 < siblings.items.len) {
                            return siblings.items[i + 1];
                        }
                        break;
                    }
                }
            }
            // Move up to parent and try again
            current = parent;
        }

        return null; // Already at last visible node
    }

    fn getPrevVisibleNode(self: *const FileTree, node: *const TreeNode) ?*TreeNode {
        const parent = node.parent orelse return null;

        // Find our index in parent's children
        if (parent.children) |siblings| {
            for (siblings.items, 0..) |sibling, i| {
                if (sibling == node) {
                    if (i == 0) {
                        // First child, go to parent
                        return parent;
                    } else {
                        // Go to previous sibling's last visible descendant
                        return self.getLastVisibleDescendant(siblings.items[i - 1]);
                    }
                }
            }
        }

        return null;
    }

    fn getLastVisibleDescendant(self: *const FileTree, node: *const TreeNode) *TreeNode {
        var current = node;
        while (current.node_type == .directory and current.isExpanded(self)) {
            if (current.children) |children| {
                if (children.items.len > 0) {
                    current = children.items[children.items.len - 1];
                    continue;
                }
            }
            break;
        }
        return @constCast(current);
    }

    /// Get a flat list of visible nodes (for rendering)
    pub fn getVisibleNodes(self: *const FileTree, allocator: std.mem.Allocator) !std.ArrayList(*TreeNode) {
        var result = std.ArrayList(*TreeNode){};
        try result.ensureTotalCapacity(allocator, 32);
        try self.collectVisibleNodes(self.root, &result, 0);
        return result;
    }

    fn collectVisibleNodes(
        self: *const FileTree,
        node: *const TreeNode,
        list: *std.ArrayList(*TreeNode),
        depth: usize,
    ) !void {
        try list.append(self.allocator, @constCast(node));

        if (node.node_type == .directory and node.isExpanded(self)) {
            if (node.children) |children| {
                for (children.items) |child| {
                    try self.collectVisibleNodes(child, list, depth + 1);
                }
            }
        }
    }

    /// Get the depth level of a node (for indentation)
    pub fn getNodeDepth(node: *const TreeNode) usize {
        var depth: usize = 0;
        var current = node.parent;
        while (current) |parent| {
            depth += 1;
            current = parent.parent;
        }
        return depth;
    }
};
