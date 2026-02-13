# Feature 23: Full Regular Expression Scrollback Search

## Overview
Extend the incremental search feature to support full Perl-compatible regular expressions (PCRE), multi-file/grep-style searches across entire scrollback buffer, search/replace operations (visual only), and integration with external grep/rg/ag for complex queries.

## Problem
Feature 09 (search overlay) supports only literal string search. Many users need regex for:
- Finding log patterns: `/error.*\d{4}/`
- Searching variable names with word boundaries: `/\bvar_[a-z]+\b/`
- Negation and alternation: `/^(INFO|WARN):/`
- Case-insensitive search: `/foo/gi`

## Proposed Solution

### 1. Regex Engine Integration
Use `re2` (Facebook's regex library) or `pcre2` via Zig bindings:
- `re2` is safer (no catastrophic backtracking), but PCRE syntax subset
- `pcre2` full PCRE2, more features but potential ReDoS

Zig pure options:
- `std.regex` if available? Not in std yet.
- Wrap C library: easiest for v1

Bindings:
- `zig-re2` (if exists) or `re2-zig`
- Or embed small regex engine like `regex-automata` (Rust port in Zig?)

Decision: Start with Oniguruma (what ghostty-vt uses for syntax highlighting?). Check ghostty-vt API.

Actually ghostty-vt probably exposes regex for incremental search? Let's check. Our terminal module already uses ghostty, which may have regex.

Assuming ghostty-vt doesn't have search regex, implement simple:

### 2. Regex Compilation and Caching
- Compile regex pattern on user input (with error reporting)
- Cache compiled regexs (LRU, max 100) to avoid recompilation
- Store both compiled pattern and original string

```zig
const RegexCache = struct {
    map: std.AutoHashMap([]const u8, *Regex),
    lru: std.ArrayList([]const u8),

    pub fn getOrCompile(self: *RegexCache, pattern: []const u8, case_insensitive: bool) !?*Regex {
        if (self.map.get(pattern)) |cached| return cached;

        const options = .{ .case_insensitive = case_insensitive };
        const regex = try Regex.compile(pattern, options);
        try self.map.put(pattern, regex);
        try self.lru.append(pattern);
        if (self.lru.items.len > 100) {
            const oldest = self.lru.orderedRemove(0);
            _ = self.map.remove(oldest);
        }
        return regex;
    }
};
```

### 3. Search Overlay Enhancements

Add UI controls to overlay:
- `/` → open search with `/` mode (literal by default)
- `Ctrl+R` toggles regex mode; `/` becomes regex input
- `Ctrl+I` toggles case-insensitive
- Show regex syntax errors inline as user types (red underline)
- Show match count: `123 matches`

Search input field now has mode indicator:
```
/ pattern [regex] [case]           # indicator badges
```

### 4. Multi-Match Navigation
With regex, a single match may span multiple cells (unlikely) or have capture groups.
- Navigate matches with n/N (next/prev)
- Optional: `Enter` jumps to match, selects capture group? Not needed.

### 5. Search Across Visible + Scrollback
Same as before, but now using `regex.find()` instead of `std.mem.indexOf`:
```zig
fn findMatches(term: *Terminal, regex: *Regex, direction: SearchDirection) !SearchResult {
    const rs = &term.render_state;
    const rows = rs.row_data.slice().items(.cells);

    var matches = std.ArrayList(Match).init(allocator);

    const range = if (direction == .forward)
        0..rows.len
    else
        std.mem.reverse(0..rows.len);

    for (range) |row| {
        const cells = rows[row].slice().items(.raw);
        const row_text = renderRowAsString(cells);

        var it = regex.iterator(row_text);
        while (it.next()) |match| {
            try matches.append(.{ .row = @intCast(row), .start = @intCast(match.start), .end = @intCast(match.end) });
        }
    }

    return SearchResult{ .matches = matches.toOwnedSlice() };
}
```

### 6. Search Replace (Preview Mode)
Advanced: Replace matches in scrollback (only visual, not affecting PTY).
User types:
```
:%s/foo/bar/g
```
Like Vim's `cmdline` mode.

Implementation:
- Parse substitute command (or use separate `:replace` command)
- Preview: highlight all affected cells in different color (e.g., yellow)
- User confirms: changes applied to terminal render state (dirty flag update)
- Not sent to PTY; purely visual annotation

Better: keep simple - just search for now.

### 7. External Search Integration
Command: `:grep pattern` → run external `rg` or `grep` on scrollback buffer, show results in quickfix list.

Flow:
```zig
fn cmdGrep(args: []const u8) void {
    const pattern = args;
    // Dump scrollback to temp file (as plain text)
    const tmp = std.fs.cwd().openIterableDir()?;
    const file = tmp.createFile("grep_input.txt", .{}) catch |err| {
        log err; return;
    };
    defer file.close();
    // Write all scrollback rows as text with line numbers
    // Spawn `rg --line-number pattern` with file as stdin
    // Capture output: "line:match"
    // Display in overlay with clickable results (jump to line)
}
```

Not essential for MVP.

### 8. Multi-File Search (Behind External)
When using `:vimgrep` or `:grep` with file patterns, but inside terminal? Not applicable.

### 9. Search Substitution
Allow replacing matches in scrollback (visual only):
- Show diff/preview
- Apply changes to render state cell text (modifies cells in place)
- Keep original? Better: don't modify scrollback; use temporary copy

Skipping for now; too complex.

### 10. Performance Optimizations
- Regex compilation caching (mentioned)
- Search only visible and nearby scrollback first, expand if needed
- For 100k line scrollback, regex could be slow; implement timeout (1s max)
- Background thread for search if blocking main? But main needs to stay responsive. Could do search on main but yield periodically using coroutines? Not in Zig yet.

Simpler: limit search to 5000 rows default; user can `:set scrollback_max` to reduce. Or accept that large regex searches may cause a brief pause.

### 11. Escaping Special Characters
When entering regex, user may want to search for literal `*` or `[`.
- Auto-detect: if pattern contains regex metachars, assume regex
- Or explicit mode toggle (Ctrl+R)
- Visual indicator

### 12. Save Search Query
Like browsers: store last 20 searches, access with up/down arrows in search input.
Store: pattern, regex flag, case flag.

### 13. Search in Selection Only
Option: limit search to current selection (visual mode).
- Select region (mouse or Shift+Arrows)
- Press `/` → search only within selected lines
- Useful for focused searching

Implementation: track selection bounds; `findMatches` only iterates selection rows.

### 14. Replace in Selection (Advanced)
Same but replace only within selected region.
Complex; skip for now.

### 15. Search History Persistence
Store searches in `~/.config/gemra/search_history.json`:
```json
{"searches": [{"pattern": "error", "regex": false, "count": 42}]}
```
Sorted by frequency; top suggestions in picker.

### 16. Overlay UI Changes

Current search (literal):
```
Search: /foo
3/47 matches
```

Regex version:
```
Search: /error.*\d{4} [regex] [case-insensitive]
12 matches
```

If error:
```
Search: /([a-z/ [regex]
  ^ missing closing ]
```

### 17. Keybindings for Regex
- `/` opens search, default literal
- `Ctrl+R` toggles regex mode (toggle button in overlay)
- `Ctrl+I` toggles case insensitive
- `Alt+R` switches to regex and focuses input (single keystroke)

### 18. Configuration
```json
{
  "search": {
    "default_mode": "literal",  // or "regex"
    "case_sensitive_default": false,
    "regex_engine": "re2",      // or "pcre"
    "max_history": 50,
    "re_timeout_ms": 1000
  }
}
```

### 19. Testing
- `/foo` literal finds "foo"
- `/f.o` regex finds "f o", "f.o", etc.
- `/\\d{4}/` finds "2024"
- `/^#include/` with multiline mode? Each row separately (no `(?m)`)
- Case insensitive `/FOO/i` matches "foo"
- Performance: regex on 10k rows <200ms on average laptop

### 20. Integration with Other Features
- Combine with smooth scroll: search result scrolls smoothly to match
- Combine with multi-copy buffer: copy search results? Maybe
- Combine with Lua scripting: expose regex search API to plugins

## Implementation Steps
1. Add regex dependency to build.zig (re2 or pcre2)
2. Create `search/RegexCache` wrapper
3. Extend search overlay UI with regex toggle, error display
4. Update `findMatches` to use regex when enabled
5. Add configuration
6. Performance testing, timeout handling
7. Write regex help page (`:help regex`)

## References
- Vim regex documentation
- Rust regex crate (RE2 syntax)
- Ghostty's search implementation (likely uses regex)
- Zig regex libraries comparison

This feature makes search much more powerful for developers, sysadmins, and power users.
