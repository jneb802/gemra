# Feature 9: Incremental Search Overlay

## Overview
Implement a non-blocking, incremental search overlay with vi-style `/` and `?` bindings, showing live matches as you type, with navigation and replace capabilities, similar to Less/考试成绩less/Vim search but integrated into terminal UI.

## Problem
Currently no built-in search. Users must:
- Pipe output through `grep` (not incremental, breaks workflow)
- Use shell history search (only searches past commands, not output)
- Scroll back manually hunting for text (inefficient)
- External tools like `hstr` or `fzf` require context switching

## Proposed Solution

### 1. Search Overlay UI
Overlay draws on top of terminal content (not modifying grid):
- Translucent dark background covering viewport
- Search input field at bottom (matches terminal theme)
- Match counter: "3/47" (current match out of total)
- Current match highlighted with distinct background color
- Optional line numbers in gutter for match positions

**Zig integration**:
- Don't modify terminal render state
- In renderer, draw overlay as separate pass after terminal grid
- Use depth or layer ordering to ensure overlay on top
- Original terminal content still there underneath (scrollable)

### 2. Keybindings (Vim-Style)
```zig
bind "/"           → search_forward     # Start incremental forward search
bind "?"           → search_backward    # Start backward search
bind "n"           → search_next        # Next match (same direction)
bind "N"           → search_prev        # Previous match (reverse direction)
bind "Enter"       → search_accept      # Close overlay, keep cursor at match
bind "Esc"         → search_cancel      # Exit search mode, restore view
bind "Cmd+G"       → search_next        # Alternative
```

**Search mode states**:
- `inactive`: normal terminal operation
- `searching`: overlay active, accepting input, showing live matches
- `pinned`: overlay closed but highlight remains (after Enter)

### 3. Live Incremental Matching
As user types each character:
1. Get current scrollback buffer from terminal (all visible rows + offscreen)
2. Search with regex or literal string (toggle with `Ctrl+R`)
3. Move cursor to first match in search direction
4. Scroll to make cursor visible (centered or minimal)
5. Update match counter
6. Highlight all matches in viewport (different color than current match)

**Algorithm**:
```zig
fn searchInScrollback(term: *Terminal, pattern: []const u8, direction: SearchDirection) SearchResult {
    const rs = &term.render_state;
    const rows = rs.row_data.slice().items(.cells);

    // Determine search start position
    const start_row = if (direction == .forward)
        term.inner.screens.active.cursor.y + 1
    else
        term.inner.screens.active.cursor.y - 1;

    var matched_rows = ArrayList(u16).init(allocator);
    defer matched_rows.deinit();

    // Search all rows (visible + scrollback)
    const search_range = if (direction == .forward)
        start_row..rows.len
    else
        reverse(0..start_row);

    for (search_range) |row| {
        const cells = rows[row].slice().items(.raw);
        const row_text = renderRowAsString(cells); // Convert cells to string
        if (std.mem.indexOf(u8, row_text, pattern) != null) {
            try matched_rows.append(@intCast(row));
        }
    }

    // Return first match or continue from current position
    return SearchResult{
        .count = matched_rows.items.len,
        .matches = matched_rows.toOwnedSlice(),
        .current_index = 0,
    };
}
```

### 4. Regex vs Literal
- Toggle with `Ctrl+R` while searching
- Regex syntax: Oniguruma/PCRE style (what ghostty-vt uses)
- Show error inline if regex invalid (red underline)
- Remember last mode per session

### 5. Wrap vs No Wrap
- Option to wrap search at scrollback boundaries (default: yes)
- Config: `search.wrap_around = true`

### 6. Highlight All Matches
When search active:
- Draw highlight box behind all matching text cells (semi-transparent color)
- Current match highlighted differently (more opaque, border)
- Performance: cache match positions, invalidate on scroll/input

**Renderer integration**:
```zig
fn renderSearchHighlights(self: *Renderer, term: *Terminal, search_state: *SearchState) void {
    const rs = &term.render_state;
    const cell_w = self.atlas.cell_width;
    const cell_h = self.atlas.cell_height;
    const pad_x = padding_x * self.atlas.scale;
    const pad_y = padding_y * self.atlas.scale;

    for (search_state.matches) |match_row| {
        const y = @as(f32, @floatFromInt(match_row)) * cell_h + pad_y;
        // But need to scan row for actual text positions...
        // Could precompute cell positions during search
    }
}
```

### 7. Search History
- Store last N search patterns (default 50)
- Up/down arrow in search overlay cycles through history
- Persistent across sessions (config file)
- `Ctrl+H` shows history picker (optional)

### 8. Navigation Options
- `gg`/`G` while searching: jump to first/last match (like vim)
- `Ctrl+U`/`Ctrl+D`: scroll half-page while maintaining match visibility
- `Enter`/`Shift+Enter`: accept and move to next/prev match (close overlay)

### 9. Replace Mode (Optional)
Advanced: support search-and-replace within scrollback (slow, careful):
- `:%s/foo/bar/g` style command
- **Important**: Only affects view, not the underlying PTY output!
- Could implement as visual highlighting only
- Or implement actual text transformation in scrollback (destructive, needs undo)

Better: Just keep search, defer replace to external tools.

### 10. Multi-Pattern Search
Future: save named searches (bookmarks)
- `:mark foo` saves current match position as "foo"
- `:goto foo` jumps to that bookmark
- Useful for long scrollback logs

## Configuration
```json
{
  "search": {
    "wrap_around": true,
    "highlight_all": true,
    "case_sensitive": false,
    "use_regex": false,
    "history_size": 50,
    "incremental": true,
    "persist_history": true
  },
  "keybindings": {
    "search_forward": "/",
    "search_backward": "?",
    "search_next": "n",
    "search_prev": "N"
  }
}
```

## Implementation Phases
1. **Phase 1**: Basic literal search without overlay (search command moves cursor)
2. **Phase 2**: Overlay UI with input field
3. **Phase 3**: Incremental matching + highlight all
4. **Phase 4**: Regex, search history
5. **Phase 5**: Replace mode (if desired)

## File Structure
```
src/
  search.zig          ← SearchState, SearchOptions, search algorithms
  window.zig          ← Add keybindings, search mode overlay
  renderer.zig        ← render search highlights
  terminal.zig        ← scrollToRow (for search result positioning)
```

## Performance Considerations
- Searching entire scrollback (10,000 rows) on each keystroke could be slow
- Optimizations:
  - Index by first character → skip non-matching rows quickly
  - Cache previous search results, filter incremental
  - Limit search to visible + nearby rows for large scrollbacks (configurable)
  - Background thread for search (if UI blocks) → but UI thread must be responsive

## Testing
- `/foo` highlights all foo instances in current viewport
- `n`/`N` navigates matches correctly
- Esc exits search, highlights cleared
- Regex mode: `/v\\d+/` finds v followed by digits
- Wrap: `?end` at top wraps to bottom
- Efficiency: 10,000 row scrollback, search remains <16ms per keystroke

## References
- Less (pager) search implementation
- Vim's incremental search (incsearch)
- VS Code search widget UX
