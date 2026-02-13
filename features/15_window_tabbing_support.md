# Feature 15: Native macOS Tab Integration

## Overview
Leverage macOS's native window tabbing system (10.12+) to allow users to group multiple terminal windows into a single tabbed window, using standard macOS gestures (Cmd+Shift+\\) and Tab bar UI, with each tab hosting an independent terminal session.

## Problem
Current: each terminal window is separate.
Users managing many windows want:
- Tabbed interface (like Safari, Terminal.app)
- Standard macOS Tab bar with drag reordering
- Merge windows into tabs and vice versa
- System-integrated tab switching (Ctrl+Tab)

## Proposed Solution

### 1. Enable macOS Tabbing
In window creation (`window.zig`):
```zig
objc.msgSendVoid(win, objc.sel("setTabbingMode:"), @as(u64, 1)); // NSWindowTabbingModePreferred
objc.msgSendVoid(win, objc.sel("setAllowsAutomaticWindowTabbing:"), @as(u64, objc.YES));
```

**Tab modes**:
- `NSWindowTabbingModePreferred` → our window allows tabbing, participates in system UI
- `NSWindowTabbingModeAllowed` → can be tabbed but not preferred
- `NSWindowTabbingModeDisallowed` → no tabbing (default? we want preferred)

### 2. Tabbed Window Architecture

Each tab = independent `Terminal` instance with its own:
- PTY/shell process
- Render state
- Scrollback buffer
- Selection

But shared:
- Main NSWindow (the tabbed container)
- Renderer? Could be shared or per-tab (simpler: per-tab)
- AppContext? Per-tab variant

**Data model**:
```zig
const Tab = struct {
    term: *Terminal,
    pty: *Pty,
    renderer: *Renderer,  // Could be shared but different viewports?
    title: []u8,
    dir: []u8,            // Current working directory
    state: TabState,
};

const TabManager = struct {
    tabs: std.ArrayList(Tab),
    active_index: usize,
    window: objc.id,  // NSWindow

    pub fn createTab(self: *TabManager) !void {
        const tab = try self.tabs.addOne();
        tab.* = try Tab.init(...);  // New PTY, new renderer layer
    }

    pub fn closeTab(self: *TabManager, idx: usize) void {
        // Cleanup tab
        self.tabs.swapRemove(idx);
        if (idx == self.active_index) {
            self.active_index = @min(idx, self.tabs.items.len -| 1);
        }
        // If no tabs left, close window
    }

    pub fn switchTab(self: *TabManager, idx: usize) void {
        // Hide previous tab's view/layer
        // Show new tab's view/layer
        // Update active_index
    }
};
```

### 3. UI: Tab Bar
macOS provides standard tab bar when tabbing enabled.
- Shows "+" button to create new tab
- Tab titles from our tab.title field
- Close button per tab (×)
- Drag to reorder
- Middle-click to close (if supported)

Our job:
- Set `window.title` or tab's `representedURL` for title
- Or implement `NSTabViewItem` attachments? Actually NSWindow tabbing doesn't expose APIs to us - system draws tab bar.

We tell the system our window title:
```zig
objc.msgSendVoid(win, objc.sel("setTitle:"), title_nsstring);
```

But each tab's title comes from `NSWindowTab` (10.13+):
```objc
if (@available(macOS 10.13, *)) {
    [window setTabTitle:myTitle];
}
```

Zig:
```zig
if (objc.respondsTo(win, objc.sel("setTabTitle:"))) {
    const title_str = ...;
    objc.msgSendVoid(win, objc.sel("setTabTitle:"), .{title_str});
}
```

### 4. Tab Switching
User actions:
- `Ctrl+Tab` / `Ctrl+Shift+Tab` → next/prev tab
- `Cmd+Option+→/←` (Safari style)
- Click tab bar
- Swipe on trackpad (2-finger horizontal)
- `Cmd+Shift+\\` → merge all windows into tabs

Our keybindings:
```zig
bind "ctrl+tab" → tab_next
bind "ctrl+shift+tab" → tab_prev
bind "cmd+shift+[" → tab_prev  // macOS default
bind "cmd+shift+]" → tab_next
bind "cmd+1".."cmd+9" → tab_select(N)
```

Implement in `window.zig` keyboard handler:
```zig
if (mods.ctrl and key == .tab) {
    ctx.tab_manager.switchTo(ctx.tab_manager.active_index + 1);
    return;
}
```

### 5. Tab Lifecycle
- **New tab**: spawn new PTY, new renderer, default shell
- **Close tab**: PTY close, cleanup renderer, if last tab → close window
- **Window merge**: User drags window onto tabbed window, system creates new tab
  - We receive `NSWindow.willEnterFullScreenNotification`? Not the right one.
  - Actually system automatically creates new tab; we must handle `NSWindow.didAddTabbedWindowNotification`
  - `-window:willAddTabbedWindow:` (delegate)
  - When tab added, we must initialize our per-tab state
- **Window unmerge**: Tab dragged out → new window, we handle `didRemoveTabbedWindow`

**Quick test**: System automatically manages NSWindow tabs. We just need to:
1. Enable tabbing mode on window
2. Respond to tab selection changes to show correct content
3. Handle window delegate notifications to allocate/deallocate tab resources

### 6. Content Switching
The challenge: our view/layer is currently 1:1 with window.
With tabbing: window has multiple tabs but single content view?
Solution:
- Have one `GemraView` that can render any `Tab`
- On tab switch, update `AppContext` to point to active tab's data
- View's draw cycle reads from active terminal

```zig
// AppContext becomes:
pub const AppContext = struct {
    tab_manager: *TabManager,
    // No longer: pty, term, renderer directly
    // Access: ctx.tab_manager.active() to get current
};

// In viewSetFrameSize, etc:
const active_tab = ctx.tab_manager.active();
const pty = active_tab.pty;
const term = active_tab.term;
const renderer = active_tab.renderer;
```

But renderer needs to be per-tab because each tab may have different font settings? Possibly same.

Actually simpler: one renderer per screen, but terminal state per tab.
Renderer draws active terminal's render state. OK.

### 7. Notifications to Observe

Add to delegate:
```zig
fn windowDidAddTabbedWindow(_: objc.id, _: objc.SEL, notification: objc.id) callconv(.c) void {
    const win = objc.msgSend(objc.id, notification, objc.sel("object"), .{});
    // New tabbed window added: allocate tab state
    // Need to track which window is which in TabManager
}

fn windowDidRemoveTabbedWindow(_: objc.id, _: objc.SEL, notification: objc.id) callconv(.c) void {
    // Tab removed: cleanup tab state
}
```

But wait: macOS tabbing is automatic. When user drags window onto another, system merges. The resulting single window has tabs. The windows are still NSWindow objects, just one represents the unified window and others become tabbed windows (hidden). Complex.

Maybe easier: Don't manage anything - let system handle. Our `GemraView` is content of one window. When that window becomes tabbed with others, each window probably still has its own content view. We need full per-window state anyway.

**Reality check**: macOS tabbing creates a "tab group". One window becomes the "tabbing window" hosting the tab bar. Other windows are "tabbed windows" whose content is swapped in when their tab is selected. Each NSWindow maintains its own view hierarchy independently. So our existing per-window model is fine! When windows merge into tab group, each window still exists and has its own content view. We just get tab bar for free. No changes needed.

But we want: **our tab bar** (custom UI) removed; rely on system tab bar.
So we may need to hide our custom tab bar if we had one (we don't currently). Good.

**Conclusion**: Minimal changes needed.
- Set `setTabbingMode:NSWindowTabbingModePreferred`
- Set window title appropriately
- That's essentially it! Each window is already independent terminal. When user merges windows (drag title bar onto another), system makes tabbed window. The windows remain separate NSWindow objects with their content; system handles UI.

Enhancement: detect tab selection to update should we do anything? The active window receives key events automatically. Our `global_app_context` is per-window? Currently global single pointer. That's a problem.

### 8. Global Context Refactor
Current: `global_app_context: ?*AppContext = null` (single)
- Only supports single window
- When multiple windows, last window's context overwrites global

Need per-window context:
- Remove global, store in window's `objc.objc_setAssociatedObject`
- Or use thread-local? Not per-window.
- Better: `viewKeyDown` gets `self` (the view), from which we can fetch associated context:
  ```zig
  const ctx = objc.getAssociatedObject(self_view, "gemra_context") orelse return;
  ```

Modify window.zig to attach context to view/window:
```zig
objc.objc_setAssociatedObject(view, "gemra_context", ctx, .OBJC_ASSOCIATION_RETAIN_NONATOMIC);
```

And retrieval:
```zig
fn getContextForView(view: objc.id) ?*AppContext {
    return objc.objc_getAssociatedObject(view, "gemra_context");
}
```

Then each view's callbacks use its own context → multiple windows supported.

### 9. Keybinding Changes for Tab Navigation
Even with system tabbing, we want keyboard shortcuts within app:
Implement ourselves:
- Bind to `nextTab`/`previousTab` in key handler
- Call `[window selectNextTab:]` / `selectPreviousTab:` (10.12+)

```zig
if (mods.ctrl and key == .tab) {
    const win = objc.msgSend(objc.id, self_view, objc.sel("window"), .{});
    if (objc.respondsTo(win, objc.sel("selectNextTab:"))) {
        objc.msgSendVoid(win, objc.sel("selectNextTab:"), .{objc.YES});
    }
    return;
}
```

### 10. UX Polish
- Update `window.title` dynamically: current command, cwd, etc.
- Tab bar shows truncated title with ellipsis
- "Modified" indicator (asterisk) if shell prompt indicates dirty state
- Close tab confirmation if command running

### 11. Implementation Steps
1. Enable tabbing mode in window setup
2. Refactor context to per-view association (multi-window prep)
3. Implement per-window title updates (OSC 2; or title from shell)
4. Add keybindings for next/prev tab (if user wants)
5. Test: Start two windows, drag one onto other → tabbed
6. Test: Cmd+Shift+\\ to merge all gemra windows
7. Test: Ctrl+Tab switches
8. Test: Close tab → underlying window appears

### 12. Configuration
```json
{
  "window": {
    "tabbing": {
      "enabled": true,
      "show_plus_button": true,
      "title_template": "{host}:{dir}"  // e.g., "myhost:~/projects"
    }
  }
}
```

### 13. Edge Cases
- Each tab is entire window; may have different font sizes → odd? Acceptable.
- Tab bar appearance: system-controlled; can't customize colors
- If user disables System Preferences → Safari → "Prefer tabs when opening documents": never, our setting still works (user can drag manually)

## Benefits
- Native macOS integration (familiar UX)
- Easy window management (merge/split via drag)
- No need to implement custom tab bar UI (system does it)
- Compatible with Spaces, Mission Control

## References
- Apple WWDC 2016 "Introducing macOS Tabs"
- NSWindowTabbingMode documentation
- NSWindowDelegate methods for tabbing

## Conclusion
Feature is mostly system-provided. Our main tasks: enable tabbing, fix per-window context, update titles. Low implementation cost, high UX gain.
