const std = @import("std");
const objc = @import("objc.zig");
const Pty = @import("pty.zig").Pty;
const terminal = @import("terminal.zig");
const Renderer = @import("renderer.zig").Renderer;
const window = @import("window.zig");

const COLS: u16 = 80;
const ROWS: u16 = 24;

pub fn main() !void {
    var gpa = std.heap.GeneralPurposeAllocator(.{}){};
    defer _ = gpa.deinit();
    const allocator = gpa.allocator();

    // Initialize terminal grid
    var grid = try terminal.Grid.init(allocator, COLS, ROWS);
    defer grid.deinit();

    // Spawn PTY
    var pty = try Pty.spawn(COLS, ROWS);
    defer pty.close();

    // Create Metal device
    const MTLCreateSystemDefaultDevice = @extern(*const fn () callconv(.C) objc.id, .{
        .name = "MTLCreateSystemDefaultDevice",
    });
    const device = MTLCreateSystemDefaultDevice();
    if (device == null) {
        std.debug.print("Failed to create Metal device\n", .{});
        return error.NoMetalDevice;
    }

    // Query screen scale factor for Retina
    const NSScreen = objc.getClass("NSScreen");
    const main_screen = objc.msgSend(objc.id, @as(objc.id, @ptrCast(NSScreen)), objc.sel("mainScreen"), .{});
    const scale_factor: f32 = if (main_screen != null)
        @floatCast(objc.msgSend(objc.CGFloat, main_screen, objc.sel("backingScaleFactor"), .{}))
    else
        1.0;

    // Create renderer at physical pixel dimensions
    const phys_width = 800.0 * scale_factor;
    const phys_height = 600.0 * scale_factor;
    var renderer = try Renderer.init(allocator, device, phys_width, phys_height, scale_factor);

    // Shared state
    var mutex = std.Thread.Mutex{};
    var needs_render = std.atomic.Value(bool).init(true);

    var app_ctx = window.AppContext{
        .pty = &pty,
        .grid = &grid,
        .renderer = &renderer,
        .mutex = &mutex,
        .layer = null,
        .needs_render = &needs_render,
    };

    // Set up window (must be on main thread)
    try window.setup(&app_ctx);

    // Start I/O thread for PTY reading
    const io_thread = try std.Thread.spawn(.{}, ioLoop, .{ &pty, &grid, &mutex, &needs_render });
    defer io_thread.join();

    // Run AppKit main loop (blocks until app exits)
    window.runApp();
}

fn ioLoop(pty: *Pty, grid: *terminal.Grid, mutex: *std.Thread.Mutex, needs_render: *std.atomic.Value(bool)) void {
    var buf: [8192]u8 = undefined;

    while (true) {
        const n = pty.read(&buf) catch |err| {
            switch (err) {
                error.NotOpenForReading, error.InputOutput => return,
                else => {
                    std.time.sleep(10 * std.time.ns_per_ms);
                    continue;
                },
            }
        };

        if (n == 0) {
            if (!pty.isAlive()) {
                const app = objc.msgSend(objc.id, @as(objc.id, @ptrCast(objc.getClass("NSApplication"))), objc.sel("sharedApplication"), .{});
                objc.msgSendVoid(app, objc.sel("terminate:"), .{@as(objc.id, null)});
                return;
            }
            std.time.sleep(1 * std.time.ns_per_ms);
            continue;
        }

        mutex.lock();
        grid.feed(buf[0..n]);
        mutex.unlock();

        if (grid.dirty) {
            needs_render.store(true, .release);
        }
    }
}
