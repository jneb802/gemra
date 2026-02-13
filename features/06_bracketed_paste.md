# Feature 6: Bracketed Paste Mode with Smart Formatting

## Overview
Implement full bracketed paste protocol support with optional automatic formatting (indentation preservation, line-wise paste), providing seamless copy-paste experience from editors and web browsers without manual adjustments.

## Problem
Pasting multi-line text into terminal applications (vim, less, REPLs) often breaks due to:
- Shell interpreting paste as typed commands at full speed
- Automatic command execution before paste completes
- Indentation being mangled by terminal auto-indent
- Line wrapping issues causing truncated commands

## Proposed Solution

### 1. Bracketed Paste Protocol (Standard)
- Support DECSET 2004 (bracketed paste mode)
- Terminal sends `\e[?2004h` to enable on startup
- Shell programs (bash, zsh, fish) already negotiate this when they detect interactive terminal
- When user pastes:
  - Terminal sends `\e[200~` before paste data
  - Terminal sends `\e[201~` after paste data
- Applications can distinguish paste from typed input

### 2. Smart Paste Processing
Even with bracketed paste, some apps don't support it. Add intelligent paste handling:

#### Indentation Preservation
```zig
// Detect leading whitespace on first line
let first_line = paste_text.split('\n')[0]
let indent_width = count_leading_spaces(first_line)

// For each subsequent line:
// - If starts with less indent, dedent to that level
// - If starts with indent >= first line, keep as-is
// - Empty lines: preserve exact whitespace
```

Implementation:
```zig
fn adjustPasteIndentation(text: []const u8, cursor_col: u16) []const u8 {
    const lines = splitIndices(text, '\n');
    if (lines.len < 2) return text; // Single line, no adjustment

    const first_line_indent = countLeadingWhitespace(lines[0]);
    var result = ArrayList(u8).init(allocator);

    for (lines, 0..) |line, i| {
        if (i == 0) {
            try result.appendSlice(line);
        } else {
            const line_indent = countLeadingWhitespace(line);
            if (line_indent >= first_line_indent) {
                // Keep original (already properly indented)
                try result.appendSlice(line);
            } else {
                // Dedent to match minimum needed
                const dedent = first_line_indent - line_indent;
                try result.appendSlice(line[dedent..]);
            }
        }
        if (i < lines.len - 1) try result.append('\n');
    }

    return result.toOwnedSlice();
}
```

#### Line-by-Line Delay (Fallback)
- If bracketed paste not supported by app, insert tiny delay between lines
- Detect if app is using canonical mode (tty ICANON flag)
- For multi-line pastes, send with 2-5ms inter-line delay
- Prevents shell from parsing ahead before complete paste

#### Tab Expansion Option
- Config: `paste.expand_tabs = true/false` (default: false)
- When true, convert tabs to spaces (respecting tab stop width)
- Helpful when pasting from editors with hard tabs

#### Trim Trailing Newline
- Config: `paste.strip_trailing_newline = true` (default: true)
- Many editors add newline at EOF; terminal apps often don't expect it
- Automatically removes final newline if present

### 3. Paste History
- Store last N pastes (configurable, default 20) in ring buffer
- Keybinding to cycle through recent pastes without re-copying
- `Cmd+Shift+V` → overlay showing recent clips, pick with arrow keys
- Each entry stores:
  - Text content
  - Source application (if available from NSPasteboard)
  - Timestamp

### 4. Multi-Format Paste
NSPasteboard can contain multiple representations:
- Plain text (UTF-8)
- RTF
- Strings with attribute info (colors, fonts)
- File URLs

Implementation:
- Query pasteboard for `public.utf8-plain-text` first (fast path)
- Fallback to `public.utf16-plain-text` if needed
- Strip ANSI escape sequences from pasted text (configurable)
  - Config: `paste.strip_ansi = false` (default: true)
  - Useful when copying from terminal output

### 5. Paste Preview
- Optional overlay showing what will be pasted before committing
- Activated via keybinding (e.g., `Cmd+Shift+Option+V`)
- Shows formatted preview with line numbers
- User can edit (fix indentation) before sending to terminal
- Useful for complex multi-line snippets

## Configuration Options
```zig
paste {
    bracketed_mode = true          // Enable bracketed paste (default)
    auto_indent = true            // Preserve/align indentation
    expand_tabs = false           // Convert tabs to spaces on paste
    strip_trailing_newline = true // Remove final newline
    strip_ansi = true             // Remove escape sequences
    history_size = 20             // Number of entries to remember
    max_bytes = 1_000_000         // Reject huge pastes (1MB default)
    interline_delay_ms = 2        // Delay between lines for non-bracketed apps
}
```

## API Integration
Modify `handlePaste` in `window.zig`:
1. Fetch pasteboard text
2. Apply formatting transformations per config
3. Check bracketed paste mode from terminal flags
4. Send to PTY with appropriate framing (brackets or raw)

## Edge Cases
- **Huge pastes**: >100K lines? Stream in chunks to avoid PTY buffer overflow
- **Binary data**: Detect NUL bytes, ask user confirmation (security)
- **Circular paste**: If paste triggers another paste event, detect and break cycle
- **Unicode normalization**: Normalize to NFC for consistent behavior?

## Testing
- Paste into vim, emacs, nano, less, cat, python REPL, node REPL
- Verify indentation preserved
- Verify bracketed escape sequences correctly sent/consumed
- Test with real-world copy from: VS Code, Chrome, iTerm2, vim itself

## References
- XTerm control sequences: https://invisible-island.net/xterm/ctlseqs/ctlseqs.html#h2-Bracketed-Paste-Mode
- Vim's `:set paste` mode and its relation to bracketed paste
- iTerm2 paste formatting options

## Future Extensions
- **Smart columnar paste**: Paste into specific columns (for tabular data)
- **Paste as streaming**: For multi-GB file transfers, stream through PTY with backpressure
- **Filtered paste**: Apply sed-like transformations before paste (strip timestamps, etc.)
