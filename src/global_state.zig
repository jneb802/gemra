const std = @import("std");
const objc = @import("objc.zig");
const Terminal = @import("terminal.zig").Terminal;
const Renderer = @import("renderer.zig").Renderer;
const Atlas = @import("atlas.zig").Atlas;
const TabManager = @import("tabs.zig").TabManager;

pub const GlobalState = struct {
    // Shared resources
    renderer: *Renderer,
    device: objc.id,

    // Tab management
    tab_manager: TabManager,
    render_needed: *std.atomic.Value(bool),

    // Thread safety for tab list operations
    global_mutex: std.Thread.Mutex,

    // Atomic active tab index (read by timer, written by UI events)
    active_tab_index: std.atomic.Value(usize),

    // Window geometry - updated on view resize
    scale: f32,
    view_width: f32,
    view_height: f32,
    cols: u16,
    rows: u16,

    // Layer (CAMetalLayer)
    layer: objc.id,

    // Cached font metrics (from renderer/atlas) for layout calculations
    cell_width: f32,
    cell_height: f32,
    padding_x: f32,
    padding_y: f32,

    // Tab bar configuration
    tab_height: f32 = 30.0, // logical pixels (before scale)
    tab_padding: f32 = 8.0,
    tab_close_size: f32 = 16.0,

    const Self = @This();

    pub fn init(
        allocator: std.mem.Allocator,
        renderer: *Renderer,
        device: objc.id,
        cols: u16,
        rows: u16,
        scale: f32,
        layer: objc.id,
        render_needed: *std.atomic.Value(bool),
    ) !*Self {
        const self = try allocator.create(Self);
        self.* = .{
            .renderer = renderer,
            .device = device,
            .tab_manager = TabManager.init(allocator),
            .render_needed = render_needed,
            .global_mutex = std.Thread.Mutex{},
            .active_tab_index = std.atomic.Value(usize).init(0),
            .scale = scale,
            .view_width = 800.0 * scale,
            .view_height = 600.0 * scale,
            .cols = cols,
            .rows = rows,
            .layer = layer,
            .cell_width = renderer.atlas.cell_width,
            .cell_height = renderer.atlas.cell_height,
            .padding_x = Renderer.padding_x,
            .padding_y = Renderer.padding_y,
        };

        // Create initial tab
        _ = try self.tab_manager.add(cols, rows, render_needed);

        return self;
    }

    pub fn deinit(self: *Self, allocator: std.mem.Allocator) void {
        self.tab_manager.deinit();
        allocator.destroy(self);
    }

    /// Gets the active tab (in context where tab list is stable).
    pub fn getActiveTab(self: *const Self) ?*@import("tabs.zig").Tab {
        return self.tab_manager.getActive();
    }

    /// Switches active tab and marks render needed.
    pub fn switchToTab(self: *Self, index: usize) void {
        self.tab_manager.switchTo(index);
        self.active_tab_index.store(index, .release);
        self.render_needed.store(true, .release);
    }

    /// Adds a new tab, makes it active.
    pub fn addTab(self: *Self, cols: u16, rows: u16) !void {
        _ = try self.tab_manager.add(cols, rows, self.render_needed);
        // active_index is updated inside add()
        self.active_tab_index.store(self.tab_manager.active_index, .release);
        self.render_needed.store(true, .release);
    }

    /// Closes the active tab.
    /// Returns true if tabs became empty, false otherwise.
    pub fn closeActiveTab(self: *Self) bool {
        _ = self.tab_manager.closeActive();
        const is_empty_now = self.tab_manager.len() == 0;

        // Update active index atomically
        if (!is_empty_now) {
            self.active_tab_index.store(self.tab_manager.active_index, .release);
        }

        self.render_needed.store(true, .release);

        return is_empty_now;
    }

    /// Resizes all tabs (called when window resizes).
    /// Note: only active tab is resized immediately; background tabs get resized lazily on activation?
    /// We'll resize all to keep them in sync.
    pub fn resizeTabs(self: *Self, cols: u16, rows: u16) void {
        // Currently, each tab's pty is accessed from its own I/O thread.
        // Resize is safe if we lock the tab's mutex.
        var i: usize = 0;
        while (i < self.tab_manager.tabs.items.len) : (i += 1) {
            const tab = self.tab_manager.tabs.items[i];
            tab.mutex.lock();
            defer tab.mutex.unlock();
            tab.term.resize(cols, rows) catch {};
            tab.pty.setSize(cols, rows);
        }
        self.cols = cols;
        self.rows = rows;
    }

    /// Update viewport size (physical pixels).
    pub fn updateViewport(self: *Self, width: f32, height: f32) void {
        self.view_width = width;
        self.view_height = height;
    }

    /// Update scale factor (Retina).
    pub fn updateScale(self: *Self, scale: f32) void {
        self.scale = scale;
    }

    /// Gets the active tab's layout manager, if it exists
    pub fn getActiveLayout(self: *const Self) ?*@import("layout.zig").LayoutManager {
        const tab = self.getActiveTab() orelse return null;
        return tab.layout;
    }

    /// Initializes layout for the active tab (terminal-only initially)
    pub fn initLayoutForActiveTab(self: *Self, allocator: std.mem.Allocator) !void {
        const tab = self.getActiveTab() orelse return error.NoActiveTab;
        if (tab.layout != null) return; // Already has layout

        const Rect = @import("view.zig").Rect;
        const tab_bar_height = self.tab_height * self.scale;
        const viewport = Rect{
            .x = 0,
            .y = tab_bar_height,
            .width = self.view_width,
            .height = self.view_height - tab_bar_height,
        };

        const LayoutManager = @import("layout.zig").LayoutManager;
        const layout = try allocator.create(LayoutManager);
        errdefer allocator.destroy(layout);
        layout.* = try LayoutManager.init(allocator, viewport);

        // Wrap terminal in a TerminalView
        const TerminalView = @import("views/terminal_view.zig").TerminalView;
        const term_view = try TerminalView.init(allocator, tab.term);
        _ = try layout.addPane(&term_view.view);

        tab.layout = layout;
        tab.layout_allocator = allocator;
    }

    /// Closes layout for active tab, returning to direct rendering
    pub fn closeLayoutForActiveTab(self: *Self) void {
        const tab = self.getActiveTab() orelse return;
        if (tab.layout) |layout| {
            layout.deinit();
            if (tab.layout_allocator) |alloc| {
                alloc.destroy(layout);
            }
            tab.layout = null;
            tab.layout_allocator = null;
        }
        self.render_needed.store(true, .release);
    }
};
