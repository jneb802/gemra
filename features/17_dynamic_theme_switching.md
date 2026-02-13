# Feature 17: Dynamic Theme Switching with Hot Reload

## Overview
Support runtime theme switching with smooth color transitions, automatic day/night cycle based on macOS appearance, and hot reload of external theme files without restarting the terminal, providing seamless customization experience.

## Problem
Currently, colors are set at startup based on default palette or compile-time config. To change colorscheme:
- Edit config file and restart terminal
- Manual OSC 4/10/11/12 sequences not well supported
- No smooth transition (instant snap)
- No day/night auto-switching

## Proposed Solution

### 1. Theme Definition Format
JSON or TOML file with color definitions:
```json
{
  "name": "Ocean Dark",
  "colors": {
    "foreground": "#dde1e7",
    "background": "#1a1b26",
    "cursor": "#7aa2f7",
    "selection": "#25365c",
    "palette": [
      "#1a1b26",  // black
      "#f7768e",  // red
      "#9ece6a",  // green
      "#e0af68",  // yellow
      "#7aa2f7",  // blue
      "#bb9af7",  // magenta
      "#7dcfff",  // cyan
      "#bfc6d4",  // white
      "#414868",  // bright black (gray)
      "#f7768e",  // bright red
      "#9ece6a",  // bright green
      "#e0af68",  // bright yellow
      "#7aa2f7",  // bright blue
      "#bb9af7",  // bright magenta
      "#7dcfff",  // bright cyan
      "#c0caf5"   // bright white
    ]
  },
  "cursor_style": "block",  // block, underline, bar
  "cursor_text": null       // If null, use foreground
}
```

Also support OSC 4 format (semicolon-separated `\e]4;index;rgb:RRRR/GGGG/BBBB\e\\`).

### 2. Theme Hot Reload
Watch config directory for changes:
- macOS: `FSEventStream` or `kd watching` (kqueue)
- When theme file modified:
  - Parse new theme
  - Validate colors (parse hex, check range)
  - Compute derivative colors (bright variants if not specified)
  - **Animate transition** to new colors over 300-500ms

#### Animation Implementation
- Interpolate RGBA values from old palette to new
- In `delegateTimerFired`, update `term.inner.colors` gradually
- Use easing function (smoothstep)
- Duration configurable (default 400ms)
- Per-color component lerp

```zig
const ColorTransition = struct {
    start: Color,
    end: Color,
    start_time: i128,
    duration_ms: u32 = 400,
    easing: Easing,

    pub fn progress(self: *ColorTransition, now: i128) f32 {
        const t = @as(f32, @floatFromInt(now - self.start_time)) / @as(f32, @floatFromInt(self.duration_ms * 1_000_000));
        return self.easing.ease(@min(t, 1.0));
    }

    pub fn current(self: *ColorTransition, now: i128) Color {
        const p = self.progress(now);
        return .{
            .r = self.start.r + @as(u8, @intFromFloat(@as(f32, @floatFromInt(self.end.r - self.start.r)) * p)),
            .g = self.start.g + @as(u8, @intFromFloat(@as(f32, @floatFromInt(self.end.g - self.start.g)) * p)),
            .b = self.start.b + @as(u8, @intFromFloat(@as(f32, @floatFromInt(self.end.b - self.start.b)) * p)),
            .a = 255,  // Alpha usually constant
        };
    }
};
```

In render loop:
```zig
if (theme_transition) |*t| {
    const now = std.time.nanoTimestamp();
    const colors = t.current(now);
    ctx.term.inner.colors = colors;  // Actually apply to terminal (but need mutex)
    if (t.progress(now) >= 1.0) {
        theme_transition = null;  // Done
    }
}
```

### 3. Day/Night Automatic Switching
- Query macOS appearance: `NSApp.effectiveAppearance.name`
- If `NSAppearanceNameAqua` → day theme; `NSAppearanceNameDarkAqua` → night
- User config: `"theme": { "day": "Light", "night": "Dark", "auto": true }`
- Observe `NSApplication.didChangeEffectiveAppearanceNotification`
- Trigger theme transition automatically

### 4. Command Palette: Theme Picker
- `Cmd+Shift+T` → overlay showing available themes
- Filter themes by name (type to filter)
- Preview: show sample terminal with theme applied
- Select: apply theme (with animation)

Implementation:
- Load all theme files from `~/.config/gemra/themes/`
- Show grid/list with theme name + color swatch
- On select, apply immediately

### 5. Theme Export/Import
- Export current theme to file (shareable)
- `Export Theme...` menu item
- `Import Theme...` to drop in `.json` or `.toml`
- Validate on import (reject malformed)

### 6. OSC 4/10/11/12 Palette Queries
Modern terminals support OSC to query/set colors:
- `\e]4;?ruby\e\\` → query color index
- `\e]10;rgb:RRRR/GGGG/BBBB\e\\` → set foreground
- `\e]11;rgb:...\e\\` → set background

Implement in `terminal.zig` handler:
```zig
fn handleOsc(self: *GemraHandler, params: []const u8, intermediate: u8, final: u8) void {
    if (final == 'm' and intermediate == ']') {
        // \e]4;2;rgb:RRRR/GGGG/BBBB\e\\
        if (std.mem.startsWith(u8, params, "4;")) {
            const parts = std.mem.split(u8, params, ";");
            const idx_str = parts.next() orelse return;
            const idx = std.fmt.parseInt(u8, idx_str, 10) catch return;
            const color_str = parts.next() orelse return;
            const color = parseRgbColor(color_str);
            if (color) |c| {
                self.inner.terminal.colors.palette[idx] = c;
                // Trigger rerender
            }
        }
    }
}
```

OSC 4 query:
- App sends `\e]4;?;?` → we respond with current palette
- But need to write back to PTY

### 7. Cursor Style
Themes can define cursor style:
- `block` (default)
- `underline`
- `bar` (vertical I-beam)
- `default` (use terminal setting)

Apply via DECSCUSR sequence: `\e[2 q` (block), `\e[4 q` (underline), `\e[6 q` (bar)

### 8. Configuration Hierarchy
1. **Builtin default theme** (hardcoded)
2. **User default theme** (config file: `"theme": "MyTheme"`)
3. **Theme override files** in `~/.config/gemra/themes/`
4. **OSC runtime changes** (highest priority, no animation)
5. **Day/Night auto** overrides (mid priority)

When OSC changes color: immediate (no animation)
When theme file changes: animate
When system appearance changes: animate

### 9. Theme Preview in Settings UI
If we add a settings window:
- Theme dropdown
- Color pickers for each component
- Live preview pane showing colored terminal sample

But currently no settings UI. Could be Lua plugin.

### 10. Migration from Current
Current config has inline colors. Need to:
- Support current format (backward compat)
- Auto-migrate to theme file on first launch?
- Or just keep inline colors as "inline theme"

`config.json`:
```json
{
  "colors": { ... }  // INLINE COLORS (legacy)
  "theme": null,     // If set, overrides inline
}
```

If both, theme wins.

### 11. Validation
Theme file:
- Check 16 palette colors present (or generate)
- Check foreground/background/cursor colors
- Reject if parse error (log warning, ignore)
- Fallback to default theme if load fails

### 12. Performance
Theme transition cost:
- Update 16-18 colors × ~60fps = cheap
- Mutex lock on terminal colors (shared with I/O thread)
- Rerender required (already marked dirty)

### 13. Future Extensions
- **Animated themes**: Change colors gradually over day (sunrise/sunset simulation)
- **Context-aware themes**: Different theme per-tab/project (SSH → dark, local → light)
- **Performance theme**: Disable animations for themes on low-power
- **Image background**: Theme can include optional background image (blurred)
- **Font theme**: Theme can also set font family/size

### 14. Commands
```
:theme Ocean Dark
:theme! MyCustomTheme.json  # Load from file
:theme-export path.json
:theme-list                 # Show available
:theme-current              # Show active theme
```

### 15. Theme Distribution
Community themes on GitHub? Host curated list.
- User can `:theme-download ThemeName` to fetch from remote
- But need package manager, trust verification
- Simpler: just share files manually

## Implementation Steps
1. Define theme format (JSON schema)
2. Implement theme loader + validator
3. Add theme field to AppContext
4. Implement OSC 4 handler (non-animated)
5. Add day/night auto-switch (appearance notification)
6. Add animation framework
7. Add theme watcher (file system events)
8. Add command palette/commands
9. Migrate existing config to theme system optionally

## References
- iTerm2 dynamic theme system
- VS Code theme schema
- Terminal.app custom profiles (similar concept)
- ANSI/OSC color control sequences
