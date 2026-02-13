# Feature 7: Focus Event Reporting (Focus In/Out)

## Overview
Implement focus in/out event reporting to applications so they can adapt behavior (pause background tasks, change cursor shape, disable mouse tracking), matching xterm's focus event protocol.

## Problem
Applications like vim, tmux, and other full-screen TUIs don't know when the terminal window loses focus. This causes:
- Vim's cursor stays in insert mode shape after switching windows (confusing)
- Background tasks continue polling/updating when user is working elsewhere
- Mouse-driven modes (less, man pages) don't disable when window unfocused
- Shell prompts don't indicate focus state

## Proposed Solution

### 1. Focus Event Mode
- Support FocusEvent reporting mode (XTerm 1006 extended format also)
- Terminal responds to `\e[?1004h` (focus reporting on) and `\e[?1004l` (off)
- Most applications set this mode when they enter "full screen" or "mouse mode"

### 2. Event Sequence
When focus changes:
- If focus gained: send `\e[I` (SS3 SI - Shift In)
- If focus lost: send `\e[O` (SS3 SO - Shift Out)
- Some apps expect CSI sequences: `\e[?1004h` → `\e[?1004l` toggle (legacy)

### 3. Implementation in Window Delegate
Modify `window.zig` delegate methods:
```zig
fn delegateWindowDidBecomeKey(_: objc.id, _: objc.SEL, _: objc.id) callconv(.c) void {
    const ctx = global_app_context orelse return;

    ctx.mutex.lock();
    const focus_mode = ctx.term.inner.modes.get(.focus_event);
    ctx.mutex.unlock();

    if (focus_mode) {
        _ = ctx.pty.write("\x1b[I") catch {};
    }
}

fn delegateWindowDidResignKey(_: objc.id, _: objc.SEL, _: objc.id) callconv(.c) void {
    const ctx = global_app_context orelse return;

    ctx.mutex.lock();
    const focus_mode = ctx.term.inner.modes.get(.focus_event);
    ctx.mutex.unlock();

    if (focus_mode) {
        _ = ctx.pty.write("\x1b[O") catch {};
    }
}
```

We already have this! (lines 587-609 in window.zig). This feature is already partially implemented.

### 4. Verification & Enhancement
Current implementation:
- Checks `focus_event` mode flag (correct)
- Sends `\x1b[I` on gain, `\x1b[O` on loss (correct)
- Uses `ctx.pty.write()` directly (needs mutex lock, already done ✓)

Needs:
- **Testing**: Verify with vim, tmux, less, man
- **Configuration**: Setting to always report focus (ignore mode flag)
  - Config: `focus_reporting.always = false` (default)
  - Some apps don't enable mode but could use it
- **Blurred cursor**: Optional cursor style change when unfocused
  - Vim does this by handling focus events and changing cursor style
  - Terminal could optionally dim/hide cursor on blur (config)

### 5. Integration with Cursor Styles
When focus lost:
- Optionally change cursor to `blinking-block` or `underline` to indicate
- Send cursor style control sequence: `\e[2 q` (steady block) or `\e[4 q` (underline)
- But better to let app decide via focus events

### 6. Alt+Tab Detection (Advanced)
On macOS, `Cmd+Tab` switches apps but doesn't trigger window key/unkey immediately (AppKit delays until activation). To detect more quickly:
- Monitor `NSApplication.didResignActiveNotification`
- Send focus lost earlier (before window technically resigns key)
- Trade-off: may cause false negatives during menu bar usage

### 7. Multiple Windows
If we later add multi-window support:
- Each window tracks its own focus state independently
- Focus events sent only for window that received/lost focus

## Settings Schema
```json
{
  "focus": {
    "report_events": true,
    "ignore_mode_flag": false,
    "cursor_on_unfocus": "blink-block" // or "steady-block", "underline", "none"
  }
}
```

## Testing Checklist
- [ ] Start vim, check `:set showmode` shows -- INSERT -- in terminal
- [ ] Switch to different window, verify vim cursor changes shape (if configured)
- [ ] Return to terminal, verify vim cursor returns to normal
- [ ] In vim insert mode, Alt+Tab away, type some text, Alt+Tab back - verify no text inserted during blur
- [ ] Verify `less` page doesn't scroll when mouse wheel used during unfocus (if mouse reporting off)
- [ ] Check tmux status line updates when focus changes (if configured)

## Known Issues
- macOS sometimes delays focus lost event by ~100ms during Cmd+Tab (system gesture)
- Menu bar usage: clicking menu bar causes focus lost but window remains key
- No standard way to distinguish "menu bar active" vs "different app active"

## Future Work
- **Focus-follows-mouse**: Optional mode where focus events sent based on mouse hover (not just window focus)
- **Per-tab focus tracking**: If we add tabs, each tab may want independent focus state
- **IPC to external tools**: Hook focus events to external commands (pause music, set status)

## Conclusion
Feature is mostly implemented. Primary remaining work: testing, configuration options, and documentation.
