# Feature 28: Any-Event Mouse Tracking (XTerm 1003)

## Overview
Implement XTerm's 1003 mouse tracking mode (any-event) that reports mouse motion events even when no mouse button is pressed, enabling hover-based interactions in TUIs (Midnight Commander, vim mousemove events, custom hover tooltips) and improving mouse-driven application behavior.

## Problem
Current mouse support only reports:
- Button press/drag/release events
- No motion events when mouse moves without button held

This limits:
- Hover feedback (highlighting list items in mc, file managers)
- Vim's `'mousemove'` option (cursor moves to mouse position on hover)
- Apps wanting to track cursor position without requiring click
- Visual feedback for terminal-based dashboards

## Proposed Solution

### 1. 1003 Mode Support
Terminal responds to `CSI ? 1003 h` (enable any-event) and `CSI ? 1003 l` (disable).

When enabled, terminal sends mouse motion reports regardless of button state. Using SGR format (if 1006 also set) or X10 format otherwise.

### 2. Implementation

#### Add Mouse Moved Handler
In `window.zig`, add Objective-C method for `mouseMoved:`:
```zig
fn viewMouseMoved(self_view: objc.id, _: objc.SEL, event: objc.id) callconv(.c) void {
    const ctx = global_app_context orelse return;
    const point = pixelToGrid(self_view, event, ctx);
    const flags = objc.msgSend(u64, event, objc.sel("modifierFlags"), .{});
    const mods = input.modsFromNSEventFlags(flags);

    ctx.mutex.lock();
    const mode = input.mouseMode(&ctx.term.inner);
    ctx.mutex.unlock();

    // For any-event mode (.any), send motion report with button=0
    // For other modes like .button, motion with button held is already sent from viewMouseDragged
    if (mode == .any) {
        input.writeMouseEvent(ctx.pty.master_fd, &ctx.term.inner, 0, point.col, point.row, false, true, mods);
    }
}
```

#### Register Method
In `createViewClass`:
```zig
objc.addMethod(cls, objc.sel("mouseMoved:"), @ptrCast(&viewMouseMoved), "v@:@");
```

This method is called by NSView when mouse moves within view (tracking area must be set). Ensure view accepts mouse moved events:
```zig
fn viewAcceptsMouseMoved(_: objc.id, _: objc.SEL) callconv(.c) objc.BOOL {
    return objc.YES;
}
objc.addMethod(cls, objc.sel("acceptsMouseMovedEvents"), @ptrCast(&viewAcceptsMouseMoved), "B@:");
```

And enable tracking area in `setup`:
```zig
const tracking_area = objc.msgSend(objc.id, @as(objc.id, @ptrCast(objc.getClass("NSTrackingArea"))),
    objc.sel("alloc"), .{});
// init with rect: whole view, options: mouseMoved|activeInKeyWindow, view, nil
// or simpler: view.setAcceptMouseMovedEvents(YES); also tracking area?
objc.msgSendVoid(view, objc.sel("setAcceptsMouseMovedEvents:"), .{objc.YES});
```

### 3. Rate Limiting

Hover events can be very frequent (120Hz). To avoid flooding PTY:
- Throttle to ~60Hz (every 16ms) or configurable
- Skip events if previous motion hasn't been sent yet

```zig
var last_motion_sent: i128 = 0;
const motion_min_interval_ns = 16_000_000; // 16ms

fn viewMouseMoved(...) {
    const now = std.time.nanoTimestamp();
    if (now - last_motion_sent < motion_min_interval_ns) return;
    last_motion_sent = now;
    // ...
}
```

### 4. Cursor Position Queries

Some apps may want to query cursor position (like DSR). Already supported via `device_status` handler (CPR). That's separate.

### 5. Use Cases

- **Midnight Commander**: uses mouse hover to highlight panel items if mouse reporting enabled
- **Vim**: `set mousemove` moves cursor to mouse position on hover (no click required)
- **Lazygit**: hover over commit shows diff summary
- **Broot**: hover preview
- **htop**: maybe not

### 6. Testing

- Run `cat -v` to see raw mouse events
- Enable 1003: `printf '\e[?1003h'`
- Move mouse → output like `\e[<0;20;10M` (SGR) or `\e[MB` (X10) appears
- Move out of window? Should track within view only
- Disable 1003: output stops

### 7. Configuration

No specific config needed; mode controlled by applications via escape sequences. However, for users who find it disruptive, could add:
```json
{
  "mouse": {
    "any_event": true  // Allow 1003 mode (default true)
  }
}
```

If false, ignore `CSI ? 1003 h`.

### 8. Interaction with Other Modes

- 1003 works with 1006 (SGR), 1015 (URXVT), etc.
- If any-event enabled, motion events use same encoding format as button events
- Doesn't interfere with normal button mode; can enable both.

Our `mouseMode` currently tracks .any as distinct. So when both 1002 (button-motion) and 1003 set? Order matters. We'll treat .any as superset: if .any true, send motion always; if .button, only with button.

Ghostty likely has flags for each mode. Our wrapper uses `term.inner.modes.get(.mouse_event)` etc. Actually ghostty has `MouseEvent` mode: .none, .button, .any, .x10. So 1003 sets .any.

Our implementation of `mouseMode` in input.zig:
```zig
pub fn mouseMode(term: *const Terminal) MouseMode {
    return switch (term.flags.mouse_event) {
        .any => .any,
        .button => .button,
        .normal => .normal,
        .x10 => .x10,
        .none => .none,
    };
}
```
Good.

### 9. Performance

- Motion events at 120Hz may be heavy for PTY; rate limiting solves
- Application must handle rapid events; some apps drop if overwhelmed. Not our problem.
- 60Hz is fine.

### 10. Future: Hover UI

Could implement terminal-level hover tooltip if any-event enabled and we detect app wants it? Not part of spec. Leave to app.

### 11. Alternatives

- Use `NSEvent` tracking to send mouse moved regardless of mode but that would leak data to PTY without app opt-in. Not good.

### 12. References

- xterm control sequences: https://invisible-island.net/xterm/ctlseqs/ctlseqs.html#h3Mouse-Tracking
- vim `:help mouse`
- Ghostty mouse modes implementation

## Implementation Checklist

- [ ] Add `viewMouseMoved` method to GemraView
- [ ] Enable `acceptsMouseMovedEvents` on view
- [ ] Call `writeMouseEvent` with motion flag when mode=any
- [ ] Rate limiting (16ms)
- [ ] Test with vim `:set mousemove`
- [ ] Test with mc

This feature is relatively small (~50 LOC) and improves compatibility with many TUIs.
