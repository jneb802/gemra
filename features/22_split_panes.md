# Feature 22: Split Panes (Horizontal/Vertical)

## Overview
Add split pane support allowing users to divide the terminal window into multiple resizable panes, each with its own independent PTY/session, enabling simultaneous viewing of multiple terminals side-by-side or stacked without cluttering the workspace with separate windows.

## Problem
Current: one terminal per window. Users wanting to see multiple terminals at once (e.g., editor + tests, logs + REPL, SSH + local shell) must:
- Manually arrange windows (tedious)
- Use tmux/screen multiplexing (but those render inside one terminal, not native split)
- Lose advantages of native rendering (GPU, ligatures) when using tmux

## Proposed Solution

### 1. Pane Layout Model
Terminal window divided into grid:
```
+---------------------+
|  Pane 1  |  Pane 2 |
|          |         |
+----------+---------+
|     Pane 3         |
|                    |
+--------------------+
```

Each pane:
- Own PTY + shell process
- Own scroll state (independent scrollback)
- Own render state (selection, cursor)
- Shares renderer with window but has separate viewport

### 2. Layout Types
- **Single**: 100% window (current)
- **Horizontal Split**: Left/Right panes (adjustable divider)
- **Vertical Split**: Top/Bottom panes
- **Grid**: 2×2 or custom arrangement (future)

### 3. User Interaction

#### Create Split
- `Cmd+\` → split current pane in half (horizontal)
- `Cmd+Shift+\` → split vertical
- `Cmd+Option+\` → show split menu (horizontal, vertical, close)

#### Navigate Between Panes
- `Cmd+Option+Arrow` (Up/Down/Left/Right)
- `Ctrl+Tab` cycles MRU (most recently used)
- Mouse click focuses pane

#### Resize Panes
- Drag divider bar with mouse
- `Cmd+Option+Ctrl+Arrow` to resize by 5%
- `Cmd+Option+Shift+Arrow` to resize by 1 cell

#### Close Pane
- `Cmd+Shift+W` closes current pane
- If last pane, closes window
- Prompt if command running (configurable)

#### Rotate Layout
- `Cmd+Option+R` toggles between horizontal and vertical splits (for 2 panes)

### 4. Data Structures

```zig
pub const Pane = struct {
    pty: *Pty,
    term: *Terminal,
    id: u32,
    title: []const u8,
    // Pane geometry (updated on layout change)
    bounds: Rect,  // x, y, width, height in logical pixels
    // State
    is_active: bool,
};

pub const Layout = struct {
    panes: std.ArrayList(Pane),
    active_pane_id: u32,
    split_type: SplitType, // .single, .horizontal, .vertical, .grid
    dividers: []Divider,  // Draggable divider lines

    pub fn getActive(self: *Layout) *Pane {
        for (self.panes.items) |*pane| {
            if (pane.id == self.active_pane_id) return pane;
        }
        return &self.panes.items[0]; // fallback
    }

    pub fn split(self: *Layout, dir: SplitDirection) !void {
        const active = self.getActive();
        const new_pane = try self.createNewPane();
        // Adjust bounds:
        // horizontal: active becomes left half, new_pane right half
        // vertical: active becomes top half, new_pane bottom half
        self.active_pane_id = new_pane.id;
    }
};
```

### 5. Rendering Multiple Panes

Modify `AppContext`:
```zig
pub const AppContext = struct {
    pty: *Pty,                 // Deprecated: per-pane now
    term: *Terminal,           // Deprecated: per-pane now
    renderer: *Renderer,
    layout: *Layout,
    // ...
};

// In renderer.render():
pub fn render(self: *Renderer, layout: *Layout, layer: objc.id) void {
    const drawable = ...;
    // Render each pane in order (their backgrounds cover full area)
    for (layout.panes.items) |pane| {
        // Set scissor to pane.bounds
        objc.msgSendVoid(encoder, objc.sel("setScissorRect:"), .{pane.bounds.toMTL()});

        // Build vertices for THIS pane's terminal
        self.buildVerticesForTerminal(pane.term);

        // Draw
        objc.msgSendVoid(encoder, objc.sel("drawPrimitives:..."), .{...});
    }
}
```

Scissor test ensures each pane only draws within its bounds.

### 6. Input Routing

Each pane has focus state. When mouse click:
- Determine which pane's bounds contain click → set that pane active
- Route key events to active pane's PTY

Change `viewKeyDown` in `window.zig`:
```zig
fn viewKeyDown(_: objc.id, _: objc.SEL, event: objc.id) callconv(.c) void {
    const ctx = global_app_context orelse return;
    const layout = ctx.layout;
    const active_pane = layout.getActive();

    // Use active_pane.term, active_pane.pty instead of ctx.term/pty
    const pty = active_pane.pty;
    const term = &active_pane.term.inner;
    // ... rest same
}
```

### 7. Pane Title Bar (Optional)
Show title bar per pane (thin strip at top):
- Display pane title (command name, cwd)
- Click to focus
- Right-click context menu (close, rename, move)

Implementation: draw in `renderer` before terminal cells for each pane.

### 8. Synchronized Scrolling (Advanced)
Option to link vertical scroll between panes:
- `Cmd+Option+S` toggles sync scroll
- When scrolling one pane, others scroll proportionally
- Useful for diffing two files side-by-side

Implementation:
```zig
if (layout.sync_scroll) {
    const active = layout.getActive();
    for (layout.panes.items) |pane| {
        if (pane.id != active.id) {
            pane.term.scroll_offset = active.term.scroll_offset;
        }
    }
}
```

### 9. Pane-Specific Styling
Allow different fonts/sizes per pane?
- Config: `pane.font_override` → if set, use different atlas
- Or use same renderer but different font variant per pane? Complex.

Simplify: all panes share renderer (same font, colors). Terminal state can override per-pane colors? Not yet.

### 10. Pane Management Commands
```
:pane_split horizontal   # Split current pane left/right
:pane_split vertical     # Split current pane top/bottom
:pane_close             # Close current pane
:pane_next              # Focus next pane
:pane_prev              # Focus previous pane
:pane_swap <id>         # Swap active with specified pane
:pane_resize +10        # Increase active pane size by 10%
:pane_layout horizontal  # Arrange all panes in horizontal stack
```

Also keybindings:
```zig
bind "cmd+\\",         → pane_split_horizontal
bind "cmd+shift+\\",   → pane_split_vertical
bind "cmd+alt+right",  → pane_next
bind "cmd+alt+left",   → pane_prev
bind "cmd+shift+w",    → pane_close
```

### 11. Tmux-like Pane Navigation
`Cmd+O` then arrow keys (like iTerm2):
- `Cmd+O` then `←/→/↑/↓` → move to adjacent pane
- Quick modal navigation

### 12. Drag and Drop Reordering
- Drag pane separator to resize (standard)
- Drag pane title to move pane to different position in layout (advanced)
- Visual indicator of drop target

### 13. Pane Lifecycle
- **Creation**: fork() new PTY, spawn shell
- **Closing**: If pane closed, PTY closed, shell receives SIGHUP
- **Exit**: If shell exits, pane shows "Shell exited" message, can close or restart
- **Focus ring**: highlight border around active pane (configurable color/width)

### 14. Pane Cloning
- `Cmd+Shift+D` → clone current pane (same cwd if possible)
- Use `cwd` from PTY? Can query via `/proc` or environment
- Useful to have two terminals at same location

### 15. Layout Persistence
Per-tab or per-window layout saved to session:
- Pane arrangement
- Active pane focus
- Scroll positions per pane
- Restored on reopen

Format: JSON with pane tree:
```json
{
  "layout": {
    "type": "horizontal",
    "children": [
      {"type": "leaf", "pty_cwd": "/home/user/project", "scrollback": 1245},
      {"type": "vertical", "children": [...]}
    ]
  }
}
```

### 16. Code Structure
Add module `src/layout.zig`:
- Layout manager, pane structs, splitting algorithms
- Integration with existing PTY/Terminal

Modify `window.zig`:
- Pass layout to renderer instead of single terminal
- Input routing through layout

### 17. Performance Considerations
- Each pane = extra PTY + render state (memory)
- Vertex buffer: max size should cover sum of pane cells (max total cells unchanged)
- Renders in loop: n panes = n draw calls (scissored) = minor overhead (~10%)
- Acceptable: 4-6 panes at 60fps

### 18. Edge Cases
- **Uneven splits**: user drags divider to weird ratio → store as float (0.0-1.0)
- **Minimum pane size**: prevent collapsing to 0 (enforce 5×8 cell minimum)
- **Too many panes**: warn at 16? limit to configurable max (16 default)
- **Fullscreen pane**: zoom current pane to fill window (Cmd+Shift+Z)
- **Hidden panes**: not rendered when not visible? Always render (simpler)

### 19. Alternatives Considered
- **tmux integration**: Recognize we're inside tmux and split at tmux level → lose native rendering quality
- **iTerm2-style**: very complex with "exposure" and advanced features
- **WezTerm**: has excellent pane system with multiplexer

We'll aim for simple 2-3 pane splits; complex tabs/panes tree later if needed.

### 20. Testing
- Split horizontal → two terminals, independent scrolling
- Split vertical → stack of two
- Resize divider → both panes adjust correctly
- Close active pane → adjacent pane becomes active
- Click mouse → focus changes
- Command in each pane → output appears correctly isolated

## Implementation Order
1. Data structures (Pane, Layout)
2. Rendering loop (scissor test)
3. PTY creation per pane
4. Input routing
5. Divider drag handling (window mouse events need to check if on divider)
6. Keybindings for splits
7. Pane titles/indicators
8. Layout persistence (later)
9. Advanced features (sync scroll, zoom) (later)

This would be a major UI enhancement, bringing gemra closer to feature parity with iTerm2 and WezTerm.
