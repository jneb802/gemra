# Feature 24: Session Restore and Workspace Persistence

## Overview
Automatically save and restore complete terminal sessions including all tabs, panes, scrollback buffers, working directories, and command states across application restarts, providing a seamless "pick up where you left off" experience.

## Problem
Closing terminal (accidentally or for update) loses:
- All open tabs and their current states
- Scrollback history (if not saved)
- Current working directory per shell
- Running processes? (Can't really restore these, but can note them)

Users must manually recreate their workspace after restart.

## Proposed Solution

### 1. Session Snapshot Format
Define a structured format (JSON or TOML) stored at `~/.config/gemra/sessions/last.json` (or named sessions).

```json
{
  "version": 1,
  "created_at": 1700000000,
  "windows": [
    {
      "frame": {"x": 100, "y": 100, "width": 800, "height": 600},
      "tabs": [
        {
          "title": "project",
          "cwd": "/home/user/project",
          "command": "zsh",
          "command_line": "zsh -i",
          "scrollback": {
            "rows": [
              ["cell1", "cell2", ...],
              ...
            ]
          },
          "scroll_position": 245,
          "selection": {"anchor": {"col": 10, "row": 240}, "endpoint": ...}
        }
      ],
      "active_tab": 0
    }
  ]
}
```

Scrollback serialization is heavy. Options:
- **Full**: Save entire scrollback (text only, no style) → large file but perfect restore
- **Partial**: Save last 1000 lines → most content preserved
- **Metadata only**: Save cwd, title, command, scroll position only (no buffer) → small, but content lost

Compromise: Offer levels:
```json
{
  "session": {
    "save_scrollback": "full" | "recent" | "none",
    "max_scrollback_lines": 10000
  }
}
```

### 2. Saving Sessions

**Trigger points**:
- On quit (applicationShouldTerminate)
- Periodically auto-save (every 5 minutes)
- On window close (if multiple windows)
- Manual: `:session SaveAs mysession`

**Saving process**:
1. Lock all terminal mutexes to snapshot state safely
2. For each window/tab/pane:
   - Save geometry (frame)
   - Save active tab index
   - For each tab:
     - Save title (from terminal state)
     - Save cwd (from shell integration or PTY query)
     - Save command line (from /proc or env)
     - Save scrollback buffer (text only; styles optional)
     - Save scroll offset (visible row)
     - Save selection if active
     - Save pane layout for splits
   - For each pane: same as tab
3. Unlock
4. Write to file (atomic write: temp file + rename)

**Snapshoating PTY**: Can't save actual running process. We'll save metadata and:
- If shell is still alive: we could try to restore PTY by re-attaching? Not really.
- Most practical: just start fresh shell at saved cwd, user sees previous output but shell is new.

### 3. Restoring Sessions

On startup:
1. Check for `last.json` (or command-line `--restore <session>`)
2. Load JSON
3. Create main window
4. For each window:
   - Set window frame (deferred until visible)
   - For each tab:
     - Spawn PTY with saved cwd (use `setWait` before exec? Actually can set cwd of child via `posix.fchdir(slave_fd)` or `chdir` before fork)
     - Wait for shell to initialize (might need delay)
     - Push saved scrollback text into terminal render state (bypass PTY)
     - Restore scroll position
     - Restore selection if any
     - For panes: split and spawn
5. Recreate layout dividers

**Critical**: Scrollback restoration must not send data to PTY (would confuse shell). Write directly to terminal's render_state row_data.

### 4. CWD Restoration

Two methods:
- Query parent directory from `/proc/self/fd` of PTY? Might be inaccurate after shell cd.
- Use shell integration: have shell emit OSC 7 (current working directory) on prompt.
- On restore, save CWD in session; on spawn, `posix.chdir(cwd)` before fork().

Simpler: session saves cwd; PTY spawn uses `setWait` and `posix.chdir` in child before exec.

### 5. Restoring Scrollback

`Terminal`'s render_state has row_data buffer (list of rows, each with cells).
We can reconstruct cells from serialized text:
- Load text lines (UTF-8)
- Create `Cell` for each codepoint with default style (no colors/style!)
- Optionally save/restore basic colors (foreground/background per cell) → increases size

Simplified: only text, no attributes. Users can scroll and see content.

**Performance**: Loading 100k lines could take seconds. Do on background thread with progress indicator.

### 6. Selection Restoration
Selection stored as grid coordinates. But if scrollback size differs, need to adjust.
- Save anchor and endpoint as (col, row) where row is absolute (0 = top, not viewport-relative)
- On restore, validate rows exist (if not, clamp to buffer)

### 7. Layout and Pane Splits
Save layout tree:
```json
{
  "type": "horizontal",
  "children": [
    {"type": "leaf", "tab_index": 0},
    {"type": "vertical", "children": [
        {"type": "leaf", "tab_index": 1},
        {"type": "leaf", "tab_index": 2}
    ]}
  ]
}
```

Restore by creating tabs in each leaf position.

### 8. Session Naming and Switching

Multiple sessions:
- `Last Session` (auto-saved)
- User saves: `Work`, `Personal`, `ProjectX`
- Switch: `:session Work` → restores, saves current first?
- Delete: `:session Delete Work`

UI: Command palette shows session list.

### 9. Auto-Save Configuration
```json
{
  "session": {
    "auto_save": true,
    "auto_save_interval_minutes": 5,
    "save_on_quit": true,
    "save_scrollback": "recent",  // full, recent, none
    "max_scrollback_lines": 50000,
    "restore_on_startup": "last"  // "last", "none", or session name
  }
}
```

### 10. Conflict Resolution
What if saved session references a CWD that no longer exists?
- Restore anyway, shell will start at home directory
- Log warning

What if shell executable no longer exists?
- Skip tab, show error placeholder

### 11. Security Considerations
Session files contain potentially sensitive:
- Command history (in scrollback)
- Directory paths
- Possibly passwords typed (should user trust?)

Store with 0600 permissions. Option to encrypt? Not initially.

### 12. Performance and Size

Estimate:
- 1000 lines × 80 cols × 4 bytes/char UTF-8 (multibyte) ≈ 320KB per tab
- 10 tabs, each 10k lines ≈ 32MB → manageable
- Full scrollback (100k lines) → 3.2GB → too big! Must limit.

So we default to `recent` (1000-5000 lines) or `max_scrollback_lines` set by user.

### 13. Migration from Current
Current: no session system.
- On first launch, no session file → normal start
- On quit, auto-save to `last.json`
- On restart, if session exists and `restore_on_startup != "none"`, prompt:
  "Restore previous session? [Yes/No/Always/Never]"

### 14. Implementation Phases

**Phase 1**: Basic metadata-only restore
- Save/restore tabs (new PTY, fresh shell)
- Save/restore cwd, title, scroll position (no scrollback text)
- No pane splits yet

**Phase 2**: Scrollback text restore
- Save visible + recent N lines (configurable)
- Reconstruct cell buffers on load
- Show loading progress

**Phase 3**: Pane layout persistence
- Save and restore split arrangements
- Per-pane cwd and scrollback

**Phase 4**: Selection restore, advanced metadata
- Save/restore selections
- Save per-cell attributes (colors, bold, etc.)? Optional

**Phase 5**: Named sessions, CLI commands
- `gemra --session=Work`
- Session management commands

### 15. Edge Cases
- **Session file corrupted**: delete and start fresh, log error
- **Circular save during save**: ignore while already saving
- **Multiple instances**: lock file to prevent concurrent writes
- **Disk full**: fail gracefully, warn user, continue shutdown

### 16. Testing
- Start terminal, run commands, create multiple tabs/panes
- Quit → restart → verify all tabs restored with correct content
- Scrollback: can scroll back to saved lines
- CWD: each shell `pwd` matches saved
- Running processes: not restored (expected)
- Save/restore across versions (schema migration?)

### 17. References
- VS Code workspace persistence
- iTerm2 window arrangement save/restore
- tmux resurrect plugin (inspiration)
- GNOME Terminal saved sessions

## Benefit
Users can confidently close terminal, knowing their workspace is preserved. Especially valuable for:
- Development setups with many tabs
- Remote debugging sessions
- Live logs that are valuable to keep
- Meeting demos: pick up exactly where you left off

Implementation cost: medium-high (serialization, spawning with cwd, scrollback reconstruction). But high UX payoff.
