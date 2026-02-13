# Feature 26: Touch Bar Integration for MacBook Pro

## Overview
Integrate with macOS Touch Bar to provide context-sensitive controls, quick access to common actions (tabs, commands, search), and dynamic feedback (current path, git branch, command status) for MacBook Pro users.

## Problem
Touch Bar is underutilized in terminal apps. Users miss:
- Quick tab switching
- Command shortcuts (clear, search, copy)
- Contextual hints (current mode, shell state)
- Reduced need for keyboard shortcuts

## Proposed Solution

### 1. Touch Bar Modes

Terminal supports different Touch Bar sets based on context:

- **Default**: Tab bar, search, copy/paste buttons
- **Shell Active**: Current working directory, command name, git branch
- **Searching**: Search field with clear button
- **Vi Mode**: Vim mode indicator (INSERT/NORMAL/REPLACE), common keys
- **Overlay**: Prompt, confirmations (close tab? Yes/No)

### 2. Item Types

Use `NSTouchBar` with custom items:

- `NSTouchBarItemIdentifierTouchId` → not needed
- `NSTouchBarItemIdentifierFlexibleSpace`
- `NSTouchBarItemIdentifierFixedSpace`
- Custom `NSButton` with image/title
- `NSSlider` (for volume? Not relevant)
- `NSTextField` (label, path display)

### 3. Default Layout

```
[←] [→] [T] [Search] [Copy] [Paste] [Clear]
```

Buttons:
- `←` / `→`: previous/next tab (if multiple)
- `T`: new tab
- `Search`: activate search overlay
- `Copy` / `Paste`: standard
- `Clear`: clear scrollback/terminal

Alternatively space out with flexible space.

### 4. Shell Mode Layout

Current context shows dynamic items:

```
[~/proj] [ main] [vim] [zsh]
```

- Path (ellipsized)
- Git branch with icon
- Current command (vim, less, python)
- Shell name

These are `NSTextField` items with monospaced font, truncated with ellipsis.

### 5. Implementation

#### Create Touch Bar
Respond to `NSResponder.touchBar` method in our view or window:
```zig
fn viewTouchBar(_: objc.id, _sel: objc.SEL) callconv(.c) objc.id {
    const ctx = global_app_context orelse return null;

    // Create or reuse touch bar
    if (ctx.touch_bar == null) {
        ctx.touch_bar = createTouchBar(ctx);
    }
    updateTouchBarItems(ctx); // Update dynamic items
    return ctx.touch_bar;
}
```

#### Touch Bar Construction
```zig
fn createTouchBar(ctx: *AppContext) objc.id {
    const touch_bar = objc.allocInit("NSTouchBar");

    // Set default items
    const items = NSMutableArray.array();

    // Tab items
    addButton(items, "tab_prev", "左箭头", "←", #selector("tabPrev:"));
    addButton(items, "tab_next", "右箭头", "→", #selector("tabNext:"));
    addButton(items, "new_tab", "新标签", "T", #selector("newTab:"));

    // Flexible space
    items.addObject(NSMutableItem.flexibleSpaceItem());

    // Search
    addButton(items, "search", "搜索", "放大镜图标", #selector("startSearch:"));

    // Copy/Paste
    addButton(items, "copy", "复制", "拷贝图标", #selector("copy:"));
    addButton(items, "paste", "粘贴", "粘贴图标", #selector("paste:"));

    // Clear
    addButton(items, "clear", "清除", "X图标", #selector("clear:"));

    // Set custom view controller? Not needed.

    objc.msgSendVoid(touch_bar, objc.sel("setDefaultItemIdentifiers:"), .{items});

    return touch_bar;
}
```

#### Dynamic Item Updates
Each frame or when state changes:
```zig
fn updateTouchBarItems(ctx: *AppContext) void {
    const touch_bar = ctx.touch_bar orelse return;

    // Update path label
    const path_label = getTouchBarItem(touch_bar, "path_label");
    if (path_label) |item| {
        const cwd = getCurrentCwd(ctx) orelse "";
        const display = truncatePathForTouchBar(cwd); // Ellipsize to ~30 chars
        setLabel(item, display);
    }

    // Update git branch
    const git_label = getTouchBarItem(touch_bar, "git_label");
    if (git_label) |item| {
        const branch = getGitBranch(ctx) orelse "";
        setLabel(item, branch);
    }
}
```

### 6. Touch Bar Icons

Use SF Symbols (macOS 11+) or custom PNGs:
- `SF Symbols` includes many icons: `magnifyingglass`, `doc.on.doc`, `plus`, `xmark`, etc.
- Provide fallback for older macOS.

```objc
[button setImage:[NSImage imageWithSystemSymbolName:@"magnifyingglass" accessibilityDescription:nil]];
```

Zig:
```zig
const sf_symbol = objc.msgSend(objc.id, @as(objc.id, @ptrCast(objc.getClass("NSImage"))),
    objc.sel("imageWithSystemSymbolName:accessibilityDescription:"),
    .{symbol_name, @as(objc.id, null)});
```

### 7. Mode Switching

Touch Bar updates based on terminal state:
- **Normal**: show default items
- **Search overlay**: show search field + cancel button
- **Vi insert mode**: show "INSERT" label, Esc, arrow keys maybe
- **Vi visual**: "VISUAL", yank/delete/copy buttons

Detect mode from `terminal.inner.modes` (like we do for mouse reporting):
```zig
const is_vi = ctx.term.inner.modes.get(.application_keypad) or false; // Not exact
```

Better: shell integration or API for app mode (vim, emacs). Many shells set `$VIM` or `$EMACS`.
Or detect by process name: foreground process = "vim" → show vi mode.

### 8. Touch Bar Customization

User config to enable/disable Touch Bar, customize layout:
```json
{
  "touch_bar": {
    "enabled": true,
    "show_tabs": true,
    "show_path": true,
    "show_git": true,
    "show_search": true,
    "custom_buttons": [
      {"identifier": "clear", "title": "Clear", "action": "clearTerminal"},
      {"identifier": "cmd1", "title": "Build", "action": "runCommand", "command": "make"}
    ]
  ]
}
```

Allow custom commands: button runs shell command or internal action.

### 9. Performance and UX

- Touch Bar updates are cheap; update on terminal changes (cwd change, git branch change)
- Debounce rapid updates (scrolling through history too fast)
- Haptic feedback on button press (optional): `NSHapticFeedbackManager`

### 10. Keyboard Equivalents

Touch Bar items should also have keyboard shortcuts:
- Button with `keyboard_equivalent` config
- `new_tab` → Cmd+T
- `search` → Cmd+F
- Show shortcut in button tooltip? Maybe not needed.

### 11. Testing

Test scenarios:
- Touch Bar appears when window key
- Buttons trigger actions (new tab, search, copy/paste work)
- Dynamic labels update (path changes on cd)
- Vi mode detection (if implemented)
- Turn off feature in config → Touch Bar uses system defaults

### 12. Edge Cases
- macOS 10.12.2+ required; older Touch Bar? All same
- Touch Bar broken? Disgrace gracefully (no items)
- User disables Touch Bar in System Preferences → our API may return nil; handle

### 13. Alternatives Considered
- Use `NSTouchBar` `principal` item for custom view? Overkill.
- Build entire custom Touch Bar? Not needed, just extend default set.
- Named items: each button gets identifier so we can update later

### 14. Limitations
- Touch Bar only on MacBook Pro 2016+; small user segment
- Requires macOS 10.12.2+
- Users may find it distracting; enable by default? Off by default maybe.

### 15. Future Extensions
- **Emoji picker**: Insert emoji via Touch Bar palette
- **Color picker**: Pick ANSI color for prompt? Unlikely
- **Function keys F1-F12**: add as buttons
- **Custom scripting**: Lua can add Touch Bar items

### 16. Platform Alternative
- Windows/Linux don't have Touch Bar. No impact.

### 17. Implementation Order
1. Create basic Touch Bar with static items
2. Wire actions to keybindings (delegate methods)
3. Add dynamic items (path, git)
4. Add configuration
5. Test on real Touch Bar hardware
6. Performance: ensure updates not janky

## References
- NSTouchBar class reference
- Apple Developer Touch Bar guidelines
- iTerm2 Touch Bar integration (they have extensive customization)

## Conclusion
This is a relatively small feature that adds value for MacBook Pro users. Implementation is straightforward using Cocoa APIs. Main work: ensuring Touch Bar updates correctly synchronized with terminal state.
