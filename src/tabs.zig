const std = @import("std");
const Pty = @import("pty.zig").Pty;
const terminal = @import("terminal.zig");
const Terminal = terminal.Terminal;

pub const Tab = struct {
    id: u32,
    title: []u8,
    pty: Pty,
    term: *Terminal,
    io_thread: std.Thread,
    io_thread_running: std.atomic.Value(bool),
    mutex: std.Thread.Mutex,
    // Tab state that might be used by renderer or UI
    scroll_offset: u16 = 0,
    // Optional layout manager for pane splitting (file browser)
    layout: ?*@import("layout.zig").LayoutManager = null,
    layout_allocator: ?std.mem.Allocator = null,

    const Self = @This();

    pub fn deinit(self: *Self, allocator: std.mem.Allocator) void {
        // Signal I/O thread to stop
        self.io_thread_running.store(false, .release);
        self.io_thread.join();

        // Clean up layout if exists
        if (self.layout) |layout| {
            layout.deinit();
            if (self.layout_allocator) |la| {
                la.destroy(layout);
            }
        }

        // Clean up resources
        self.pty.close();
        self.term.deinit();
        allocator.destroy(self.term);
        if (self.title.len > 0) {
            allocator.free(self.title);
        }
        // Note: Caller must destroy the Tab struct itself after calling deinit
    }
};

/// Manages a list of tabs and tracks which one is active.
pub const TabManager = struct {
    tabs: std.ArrayList(*Tab),
    active_index: usize,
    allocator: std.mem.Allocator,

    const Self = @This();

    pub fn init(allocator: std.mem.Allocator) Self {
        return Self{
            .tabs = std.ArrayList(*Tab){ .items = &[_]*Tab{}, .capacity = 0 },
            .active_index = 0,
            .allocator = allocator,
        };
    }

    pub fn deinit(self: *Self) void {
        // Close all tabs
        while (self.tabs.items.len > 0) {
            // Close from the end to preserve indices during removal
            const last_idx = self.tabs.items.len - 1;
            _ = self.closeIndex(last_idx);
        }
        self.tabs.deinit(self.allocator);
    }

    /// Creates a new tab with the given dimensions.
    /// The caller must start the I/O thread after adding the tab,
    /// because the Tab needs to be in the list before the thread starts.
    fn createTab(self: *Self, cols: u16, rows: u16) !*Tab {
        const tab_id = @as(u32, @intCast(self.tabs.items.len));

        // Spawn PTY
        const pty = try Pty.spawn(cols, rows);

        // Initialize terminal with this tab's PTY master fd
        const term = try self.allocator.create(Terminal);
        errdefer self.allocator.destroy(term);
        term.* = try terminal.Terminal.init(self.allocator, cols, rows, pty.master_fd);
        errdefer term.deinit();

        // Allocate tab on heap
        const tab = try self.allocator.create(Tab);
        errdefer self.allocator.destroy(tab);
        tab.* = Tab{
            .id = tab_id,
            .title = try self.allocator.dupe(u8, "Terminal"),
            .pty = pty,
            .term = term,
            .io_thread = undefined,
            .io_thread_running = std.atomic.Value(bool).init(true),
            .mutex = std.Thread.Mutex{},
        };

        // Add pointer to list
        try self.tabs.append(self.allocator, tab);

        return tab;
    }

    /// Adds a new tab and starts its I/O thread.
    /// The render_needed pointer is used by the I/O thread to signal that a render is needed.
    pub fn add(self: *Self, cols: u16, rows: u16, render_needed: *std.atomic.Value(bool)) !usize {
        const tab = try self.createTab(cols, rows);
        const index = self.tabs.items.len - 1;

        // Start I/O thread for this tab
        tab.io_thread = try std.Thread.spawn(.{}, ioLoop, .{
            tab,
            render_needed,
        });

        return index;
    }

    /// Closes the tab at the given index.
    /// If closing the active tab, selects a new active tab (last available or first).
    /// Returns true if tabs list is now empty after removal.
    pub fn closeIndex(self: *Self, index: usize) bool {
        if (index >= self.tabs.items.len) return false;

        const was_active = (index == self.active_index);

        // Deinit the tab (thread join and cleanup) and free it
        const tab = self.tabs.orderedRemove(index);
        tab.deinit(self.allocator);
        self.allocator.destroy(tab);

        // Update active_index
        if (self.tabs.items.len == 0) {
            // No tabs left
            return true;
        } else if (was_active) {
            self.active_index = @min(self.active_index, self.tabs.items.len - 1);
        } else if (index < self.active_index) {
            self.active_index -= 1;
        }

        return false;
    }

    /// Closes the active tab.
    /// Returns true if tabs list is now empty after removal (caller should create new tab).
    pub fn closeActive(self: *Self) bool {
        if (self.tabs.items.len == 0) return true;
        return self.closeIndex(self.active_index);
    }

    /// Switches to the tab at the given index.
    pub fn switchTo(self: *Self, index: usize) void {
        if (index < self.tabs.items.len) {
            self.active_index = index;
        }
    }

    /// Cycles to the next tab (wraps around).
    pub fn next(self: *Self) void {
        if (self.tabs.items.len == 0) return;
        self.active_index = (self.active_index + 1) % self.tabs.items.len;
    }

    /// Cycles to the previous tab (wraps around).
    pub fn prev(self: *Self) void {
        if (self.tabs.items.len == 0) return;
        self.active_index = (self.active_index + self.tabs.items.len - 1) % self.tabs.items.len;
    }

    /// Returns the active tab, or null if no tabs.
    pub fn getActive(self: *const Self) ?*Tab {
        if (self.active_index >= self.tabs.items.len) return null;
        return self.tabs.items[self.active_index];
    }

    /// Returns the number of tabs.
    pub fn len(self: *const Self) usize {
        return self.tabs.items.len;
    }
};

/// I/O loop for a single tab. Reads from PTY and feeds terminal.
fn ioLoop(tab: *Tab, render_needed: *std.atomic.Value(bool)) void {
    var buf: [8192]u8 = undefined;

    while (tab.io_thread_running.load(.acquire)) {
        const n = tab.pty.read(&buf) catch |err| {
            switch (err) {
                error.NotOpenForReading, error.InputOutput => return,
                else => {
                    std.Thread.sleep(10 * std.time.ns_per_ms);
                    continue;
                },
            }
        };

        if (n == 0) {
            if (!tab.pty.isAlive()) {
                // PTY closed, exit thread
                return;
            }
            std.Thread.sleep(1 * std.time.ns_per_ms);
            continue;
        }

        // Lock the terminal and feed data
        tab.mutex.lock();
        defer tab.mutex.unlock();
        tab.term.feed(buf[0..n]);

        // Signal that rendering is needed
        render_needed.store(true, .release);
    }
}
