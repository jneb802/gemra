# Feature 5: Lua Scripting for User Customization

## Overview
Integrate a lightweight Lua runtime for user scripting, enabling deep customization, automation, and extensibility without recompilation, following the pattern of popular editors (Vim, Neovim) and modern apps (Karabiner-Elements).

## Problem
Current terminal is statically configured at compile time. Users cannot:
- Customize keybindings beyond built-in set
- Modify rendering behavior dynamically (color schemes, cursor styles)
- Automate repetitive workflows (auto-title, session management)
- Create custom commands/plugins
- Integrate with external tools programmatically

## Proposed Solution

### 1. Embedded Lua Runtime
- Use `luajit` or `lua` (pure Zig implementation like `zluac` or `ziglua` if available)
- Allocate a dedicated Lua state per terminal session (or global for app)
- Expose safe API surface area to Lua (security: sandboxing)
- Lifetime: Lua state initialized on app start, cleaned up on exit

### 2. Scripting API Surface

#### Event Hooks
```lua
on_key(key, mods)            -- Intercept/override keypresses
on_mouse(button, col, row)   -- Custom mouse handling
on_output(data)              -- Hook into PTY output (logging, transformation)
on_resize(cols, rows)        -- React to terminal size changes
on_focus(gained)             -- Focus events
on_scroll(delta)             -- Custom scroll behavior
```

#### Terminal Control
```lua
terminal.set_title(string)
terminal.set_colors({
    foreground = "#cccccc",
    background = "#1e1e1e",
    cursor = "#ffffff"
})
terminal.send(bytes)        -- Write to PTY
terminal.scroll_to(offset)  -- Programmatic scroll
terminal.clear()            -- Clear screen/scrollback
```

#### Window Management (Future)
```lua
window.set_size(width, height)
window.get_position() -> x, y
window.toggle_fullscreen()
window.minimize()
```

#### System Integration
```lua
-- Safe, sandboxed
fs.read_file(path) -> string or nil
fs.write_file(path, data) -> success
env.get(key) -> string
env.set(key, value)
os.execute_async(command, callback)  -- With timeout and resource limits
os.clipboard_get() -> string
os.clipboard_set(text)
```

#### Custom Commands
```lua
-- Define commands that appear in menu or via keybinding
command("myplugin.open_quick_picker", function(input)
    -- Show UI overlay with search, pick from list
    -- Send selected item to terminal
end)

-- Or menu items
menu_item("File", "My Plugin Action", "cmd+shift+p", function()
    -- Action
end)
```

### 3. Script Loading & Configuration
- Default scripts bundled at `~/.config/gemra/scripts/`
- Auto-loaded on startup: `init.lua`
- Per-profile scripts: `~/.config/gemra/profiles/work.lua`
- Hot-reload: command to reload all scripts without restart
- Sandbox: restrict filesystem to config dir, limit memory/time

### 4. Plugin System Architecture
```
Zig Core
   ↓ exposes
Lua API (C functions via ffi or Zig-coded methods)
   ↓ user scripts
Plugin Manager
   ├── Keybinding Manager  ← Lua adds {key, mods, callback}
   ├── Hook Dispatcher      ← Triggers Lua callbacks
   ├── Command Registry     ← "myplugin.foobar" → Lua function
   └── IPC Bridge           ← Async commands, notifications
```

### 5. Security Model
- No arbitrary file access outside `~/.config/gemra/` (whitelist)
- No network access by default (opt-in per-script)
- Timeouts: Lua functions must return within 100ms (configurable)
- Memory limits: per-state heap size (default 16MB)
- All API errors caught and logged, don't crash terminal

### 6. Use Cases Enabled
- **Color scheme switcher**: Cycle through themes with one key
- **Auto-title**: Set tab title based on current command/path
- **Project launcher**: Quick launch common dev commands with prompts
- **Log tailing**: Highlight errors in real-time output
- **Clipboard manager**: History, filters
- **SSH session wrapper**: Auto-reconnect, session persistence
- **Git integration**: Show branch in prompt, quick staging UI
- **Notification**: Desktop alerts on long-running command completion

### 7. Configuration DSL (Alternative)
Lua may be overkill for simple keybindings. Provide YAML/TOML config too:
```toml
[keybindings]
"cmd+shift+p" = "myplugin.open_quick_picker"
"cmd+t" = "new_tab"

[hooks]
"on_output" = "scripts/log_filter.lua"
```

### 8. Implementation Steps
1. Add `lua` dependency to `build.zig.zon`
2. Create `LuaState` wrapper: safe FFI bindings, error handling
3. Expose terminal APIs (read-only first, then write)
4. Implement hook system: Zig → Lua callback bridge
5. Add command/keybinding registry
6. Sandboxing: restrict require(), io, os.execute
7. Configuration loader with fallback to default scripts
8. Documentation & example plugins

## Risks & Mitigation
- **Performance**: Lua overhead in hot paths (key handling) → keep Lua off critical path, cache lookups
- **Crashes**: Infinite loops/panics in scripts → timeouts, protected calls
- **Security**: Malicious script → sandbox, no network by default
- **Complexity**: Large API surface → start small, expand based on feedback

## Alternatives Considered
- **Scheme/Scheme48**: Cleaner semantics but poorer interop with Zig
- **Wren**: Designed for embedding, smaller than Lua
- **JavaScriptCore**: macOS built-in, heavier
- **Zig compile-time scripts**: Too static, can't change at runtime

**Decision**: Lua best balance of maturity, size, community, embedding support.

## References
- Neovim's Lua API design
- Karabiner-Elements complex Lua rules
- Wezterm's Lua configuration (but we want runtime scripts, not just config)
