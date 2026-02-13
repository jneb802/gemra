const std = @import("std");

// Suppress noisy "invalid C0 character" warnings from ghostty-vt stream parser.
pub const std_options: std.Options = .{
    .log_scope_levels = &.{
        .{ .scope = .stream, .level = .err },
    },
};

const objc = @import("objc.zig");
const Terminal = @import("terminal.zig").Terminal;
const Renderer = @import("renderer.zig").Renderer;
const FontConfig = @import("renderer.zig").FontConfig;
const GlobalState = @import("global_state.zig").GlobalState;
const window = @import("window.zig");

const COLS: u16 = 80;
const ROWS: u16 = 24;

pub fn main() !void {
    var gpa = std.heap.GeneralPurposeAllocator(.{}){};
    defer _ = gpa.deinit();
    const allocator = gpa.allocator();

    // Create Metal device
    const MTLCreateSystemDefaultDevice = @extern(*const fn () callconv(.c) objc.id, .{
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
    const font_config = FontConfig{};
    var renderer = try Renderer.init(allocator, device, phys_width, phys_height, scale_factor, font_config);
    defer renderer.atlas.deinit();

    // Shared render_needed atomic
    var render_needed = std.atomic.Value(bool).init(true);

    // Create GlobalState (includes TabManager with initial tab)
    const global_state = try GlobalState.init(
        allocator,
        &renderer,
        device,
        COLS,
        ROWS,
        scale_factor,
        null, // layer will be set during window.setup
        &render_needed,
    );
    defer global_state.deinit(allocator);

    // Set up window (must be on main thread)
    try window.setup(global_state);

    // Run AppKit main loop (blocks until app exits)
    window.runApp();
}
