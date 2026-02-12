const std = @import("std");
const objc = @import("objc.zig");

pub const AppContext = struct {
    pty: *@import("pty.zig").Pty,
    grid: *@import("terminal.zig").Grid,
    renderer: *@import("renderer.zig").Renderer,
    mutex: *std.Thread.Mutex,
    layer: objc.id,
    needs_render: *std.atomic.Value(bool),
};

var global_app_context: ?*AppContext = null;

pub fn sharedApp() objc.id {
    return objc.msgSend(objc.id, @as(objc.id, @ptrCast(objc.getClass("NSApplication"))), objc.sel("sharedApplication"), .{});
}

// Objective-C class method implementations for GemraView
fn viewKeyDown(_: objc.id, _: objc.SEL, event: objc.id) callconv(.C) void {
    const ctx = global_app_context orelse return;

    const chars = objc.msgSend(objc.id, event, objc.sel("characters"), .{});
    if (chars == null) return;

    const length = objc.msgSend(u64, chars, objc.sel("length"), .{});
    if (length == 0) return;

    const flags = objc.msgSend(u64, event, objc.sel("modifierFlags"), .{});
    const ctrl = (flags & (1 << 18)) != 0;
    const cmd = (flags & (1 << 20)) != 0;
    const key_code = objc.msgSend(u16, event, objc.sel("keyCode"), .{});

    const char_val = objc.msgSend(u16, chars, objc.sel("characterAtIndex:"), .{@as(u64, 0)});

    // Cmd+V: paste from clipboard
    if (cmd and (char_val == 'v' or char_val == 'V')) {
        const NSPasteboard = @as(objc.id, @ptrCast(objc.getClass("NSPasteboard")));
        const pb = objc.msgSend(objc.id, NSPasteboard, objc.sel("generalPasteboard"), .{});
        const NSString = @as(objc.id, @ptrCast(objc.getClass("NSString")));
        const str = objc.msgSend(objc.id, pb, objc.sel("stringForType:"), .{NSString});
        if (str != null) {
            const utf8 = objc.msgSend(?[*:0]const u8, str, objc.sel("UTF8String"), .{});
            if (utf8) |s| {
                var i: usize = 0;
                while (s[i] != 0) : (i += 1) {}
                _ = ctx.pty.write(s[0..i]) catch {};
            }
        }
        return;
    }

    // Ignore other Cmd+ shortcuts (let system handle them)
    if (cmd) return;

    var buf: [8]u8 = undefined;
    var len: usize = 0;

    if (ctrl) {
        if (char_val >= 'a' and char_val <= 'z') {
            buf[0] = @as(u8, @intCast(char_val - 'a' + 1));
            len = 1;
        } else if (char_val >= 'A' and char_val <= 'Z') {
            buf[0] = @as(u8, @intCast(char_val - 'A' + 1));
            len = 1;
        } else if (char_val == '[') {
            buf[0] = 0x1b;
            len = 1;
        } else if (char_val == '\\') {
            buf[0] = 0x1c;
            len = 1;
        } else if (char_val == ']') {
            buf[0] = 0x1d;
            len = 1;
        } else if (char_val < 32) {
            // macOS already translated the control combo (e.g. Ctrl+C → 0x03)
            buf[0] = @as(u8, @intCast(char_val));
            len = 1;
        }
    } else {
        switch (char_val) {
            0xF700 => {
                @memcpy(buf[0..3], "\x1b[A");
                len = 3;
            },
            0xF701 => {
                @memcpy(buf[0..3], "\x1b[B");
                len = 3;
            },
            0xF702 => {
                @memcpy(buf[0..3], "\x1b[D");
                len = 3;
            },
            0xF703 => {
                @memcpy(buf[0..3], "\x1b[C");
                len = 3;
            },
            0xF728 => {
                @memcpy(buf[0..4], "\x1b[3~");
                len = 4;
            },
            0xF729 => {
                @memcpy(buf[0..3], "\x1b[H");
                len = 3;
            },
            0xF72B => {
                @memcpy(buf[0..3], "\x1b[F");
                len = 3;
            },
            0xF72C => {
                @memcpy(buf[0..4], "\x1b[5~");
                len = 4;
            },
            0xF72D => {
                @memcpy(buf[0..4], "\x1b[6~");
                len = 4;
            },
            '\r', '\n' => {
                buf[0] = '\r';
                len = 1;
            },
            0x7f, 0x08 => {
                buf[0] = 0x7f;
                len = 1;
            },
            '\t' => {
                buf[0] = '\t';
                len = 1;
            },
            0x19 => {
                @memcpy(buf[0..3], "\x1b[Z");
                len = 3;
            },
            else => {
                if (key_code == 53) {
                    buf[0] = 0x1b;
                    len = 1;
                } else if (char_val < 128) {
                    buf[0] = @intCast(char_val);
                    len = 1;
                } else {
                    const utf8 = objc.msgSend(?[*:0]const u8, chars, objc.sel("UTF8String"), .{});
                    if (utf8) |s| {
                        var i: usize = 0;
                        while (s[i] != 0 and i < buf.len) : (i += 1) {
                            buf[i] = s[i];
                        }
                        len = i;
                    }
                }
            },
        }
    }

    if (len > 0) {
        _ = ctx.pty.write(buf[0..len]) catch {};
    }
}

fn viewFlagsChanged(_: objc.id, _: objc.SEL, _: objc.id) callconv(.C) void {}

fn viewAcceptsFirstResponder(_: objc.id, _: objc.SEL) callconv(.C) objc.BOOL {
    return objc.YES;
}

fn viewWantsLayer(_: objc.id, _: objc.SEL) callconv(.C) objc.BOOL {
    return objc.YES;
}

fn viewIsOpaque(_: objc.id, _: objc.SEL) callconv(.C) objc.BOOL {
    return objc.YES;
}

fn viewCanBecomeKeyView(_: objc.id, _: objc.SEL) callconv(.C) objc.BOOL {
    return objc.YES;
}

fn delegateShouldTerminate(_: objc.id, _: objc.SEL, _: objc.id) callconv(.C) objc.BOOL {
    return objc.YES;
}

fn delegateDidFinishLaunching(_: objc.id, _: objc.SEL, _: objc.id) callconv(.C) void {
    objc.msgSendVoid(sharedApp(), objc.sel("activateIgnoringOtherApps:"), .{objc.YES});
}

fn delegateTimerFired(_: objc.id, _: objc.SEL, _: objc.id) callconv(.C) void {
    const ctx = global_app_context orelse return;

    // Always render if grid is dirty OR on first frame
    if (ctx.needs_render.load(.acquire)) {
        ctx.mutex.lock();
        defer ctx.mutex.unlock();

        ctx.renderer.render(ctx.grid, ctx.layer);
        ctx.needs_render.store(false, .release);
        ctx.grid.dirty = false;
    }
}

pub fn createViewClass() objc.Class {
    const nsview = objc.getClass("NSView");
    const cls = objc.allocateClassPair(nsview, "GemraView");

    objc.addMethod(cls, objc.sel("keyDown:"), @ptrCast(&viewKeyDown), "v@:@");
    objc.addMethod(cls, objc.sel("flagsChanged:"), @ptrCast(&viewFlagsChanged), "v@:@");
    objc.addMethod(cls, objc.sel("acceptsFirstResponder"), @ptrCast(&viewAcceptsFirstResponder), "B@:");
    objc.addMethod(cls, objc.sel("wantsLayer"), @ptrCast(&viewWantsLayer), "B@:");
    objc.addMethod(cls, objc.sel("isOpaque"), @ptrCast(&viewIsOpaque), "B@:");
    objc.addMethod(cls, objc.sel("canBecomeKeyView"), @ptrCast(&viewCanBecomeKeyView), "B@:");

    objc.registerClassPair(cls);
    return cls;
}

pub fn createDelegateClass() objc.Class {
    const nsobject = objc.getClass("NSObject");
    const cls = objc.allocateClassPair(nsobject, "GemraDelegate");

    objc.addMethod(cls, objc.sel("applicationShouldTerminateAfterLastWindowClosed:"), @ptrCast(&delegateShouldTerminate), "B@:@");
    objc.addMethod(cls, objc.sel("applicationDidFinishLaunching:"), @ptrCast(&delegateDidFinishLaunching), "v@:@");
    objc.addMethod(cls, objc.sel("timerFired:"), @ptrCast(&delegateTimerFired), "v@:@");

    objc.registerClassPair(cls);
    return cls;
}

pub fn setup(ctx: *AppContext) !void {
    global_app_context = ctx;

    const app = sharedApp();
    objc.msgSendVoid(app, objc.sel("setActivationPolicy:"), .{@as(i64, 0)});

    const delegate_cls = createDelegateClass();
    const delegate = objc.alloc(delegate_cls);
    const delegate_obj = objc.msgSend(objc.id, delegate, objc.sel("init"), .{});
    objc.msgSendVoid(app, objc.sel("setDelegate:"), .{delegate_obj});

    const style_mask: u64 = (1 << 0) | (1 << 1) | (1 << 2) | (1 << 3);
    const frame = objc.CGRect{
        .origin = .{ .x = 200, .y = 200 },
        .size = .{ .width = 800, .height = 600 },
    };

    const NSWindow = objc.getClass("NSWindow");
    const win = objc.msgSend(objc.id, objc.alloc(NSWindow), objc.sel("initWithContentRect:styleMask:backing:defer:"), .{
        frame,
        style_mask,
        @as(u64, 2),
        objc.NO,
    });

    const title = objc.msgSend(objc.id, @as(objc.id, @ptrCast(objc.getClass("NSString"))), objc.sel("stringWithUTF8String:"), .{
        @as([*:0]const u8, "gemra"),
    });
    objc.msgSendVoid(win, objc.sel("setTitle:"), .{title});

    const view_cls = createViewClass();
    const view = objc.msgSend(objc.id, objc.alloc(view_cls), objc.sel("initWithFrame:"), .{frame});

    const layer = objc.allocInit("CAMetalLayer");

    const device = ctx.renderer.device;
    objc.msgSendVoid(layer, objc.sel("setDevice:"), .{device});
    objc.msgSendVoid(layer, objc.sel("setPixelFormat:"), .{@as(u64, 80)}); // MTLPixelFormatBGRA8Unorm
    objc.msgSendVoid(layer, objc.sel("setFramebufferOnly:"), .{objc.YES});

    // Account for Retina scaling
    const scale_factor = objc.msgSend(objc.CGFloat, win, objc.sel("backingScaleFactor"), .{});
    objc.msgSendVoid(layer, objc.sel("setContentsScale:"), .{scale_factor});

    const scaled_width = 800.0 * scale_factor;
    const scaled_height = 600.0 * scale_factor;
    const layer_size = objc.CGSize{ .width = scaled_width, .height = scaled_height };
    objc.msgSendVoid(layer, objc.sel("setDrawableSize:"), .{layer_size});

    objc.msgSendVoid(view, objc.sel("setLayer:"), .{layer});
    objc.msgSendVoid(view, objc.sel("setWantsLayer:"), .{objc.YES});

    ctx.layer = layer;

    // Update renderer viewport to match physical pixel size
    ctx.renderer.updateViewport(@floatCast(scaled_width), @floatCast(scaled_height));

    objc.msgSendVoid(win, objc.sel("setContentView:"), .{view});
    objc.msgSendVoid(win, objc.sel("makeFirstResponder:"), .{view});

    objc.msgSendVoid(win, objc.sel("makeKeyAndOrderFront:"), .{@as(objc.id, null)});
    objc.msgSendVoid(win, objc.sel("center"), .{});

    // Timer for rendering at ~60fps
    _ = objc.msgSend(objc.id, @as(objc.id, @ptrCast(objc.getClass("NSTimer"))), objc.sel("scheduledTimerWithTimeInterval:target:selector:userInfo:repeats:"), .{
        @as(f64, 1.0 / 60.0),
        delegate_obj,
        objc.sel("timerFired:"),
        @as(objc.id, null),
        objc.YES,
    });
}

pub fn runApp() void {
    objc.msgSendVoid(sharedApp(), objc.sel("run"), .{});
}
