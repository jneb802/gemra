# Feature 8: Multi-Entry Clipboard Ring Buffer

## Overview
Replace single-item clipboard with a ring buffer storing last N copied items, enabling quick access to previous clipboard contents via keyboard shortcuts or visual picker, significantly improving copy-paste workflows for developers and sysadmins.

## Problem
macOS clipboard only stores one item at a time. When doing complex data transfer:
- Copy item A, then copy item B → item A lost
- Need to repeatedly switch between sources/destinations
- No way to build up multiple snippets before pasting
- Must use external clipboard manager (often with bloat, privacy concerns)

## Proposed Solution

### 1. In-Memory Ring Buffer
- Fixed-size circular buffer (configurable: 10-100 entries, default 30)
- Each entry stores:
  ```zig
  const ClipboardEntry = struct {
      text: []u8,
      timestamp: i64,           // For LRU eviction
      source: []const u8,       // Optional: terminal/shell/program that provided
  };
  ```
- Pure memory (no persistence to disk by default, privacy)
- Distinct from system clipboard: our buffer + system clipboard as separate targets

### 2. Smart Copy Behavior
- **Cmd+C** (current): copy selection to our ring buffer AND system clipboard
- **Alt+Cmd+C** (new): copy to ring buffer only (not system)
  - Useful for building up snippets without polluting system clipboard
- Entries deduplicated: identical text not stored twice in a row
- Entry size limit: truncate >1MB by default (configurable)

### 3. Paste Selection
- **Cmd+V**: paste from most recent ring entry (also writes to system clipboard)
- **Cmd+Shift+V** (new): open visual picker to choose from ring
  - Shows last N entries with preview (first 50 chars, line count)
  - Filter by typing (incremental search)
  - Arrow keys to select, Enter to paste
  - Preview panel shows full content with line numbers
  - Sort options: recency, alphabetical, length
- **Ctrl+Cmd+V** (new): paste N-th most recent (numeric prefix)
  - `Cmd+1` → most recent
  - `Cmd+2` → second most recent
  - Up to configurable max (e.g., 9)

### 4. System Clipboard Integration
Two-way sync options:
- **Always sync**: Copied text also goes to system clipboard (current behavior)
- **Manual sync**: Only specified ring entries populate system clipboard when pasted
- **Selective**: `Cmd+Option+C` copies selection to system clipboard directly (bypasses ring)
- Config: `clipboard.sync_with_system = true`

### 5. Type-Ahead Filtering
In picker UI:
- Type to filter entries by text content
- Match on substring (case-insensitive)
- Highlight matched text in preview
- Navigate with arrow keys, Ctrl+N/Ctrl+P (vim-style)

### 6. Entry Metadata
Track per entry:
- **Origin**: Which terminal tab/window/PTY produced it
- **Timestamp**: Age of entry (hh:mm:ss or "2m ago")
- **Type**: Plain text, command, URL, password (heuristic detection)
- **Line count**: Multi-line indicator
- **Preview**: First line or truncated preview

### 7. Keyboard Shortcuts (macOS)
```zig
bind "cmd+c"        → copy_and_store      # Current
bind "alt+cmd+c"    → copy_no_sync        # New
bind "cmd+v"        → paste_latest
bind "shift+cmd+v"  → show_picker         # New
bind "ctrl+cmd+v"   → cycle_paste_buffer  # New (alternates on repeated press)
bind "cmd+shift+1"  → paste_slot_1
bind "cmd+shift+2"  → paste_slot_2
...
```

### 8. Visual Picker UI
Overlay window (like Spotlight):
- Centered, 400×300 window
- List view: 15-20 visible entries with ellided preview
- Detail pane below list shows full selected entry
- Status line: entry count, filter hint, help (Esc to cancel)
- Styling: match terminal theme (dark/light aware)
- Animations: fade in/out, smooth list scrolling

Implementation approach:
- Use separate NSWindow with NSTableView/NSCollectionView
- Or draw custom with Metal/Quartz (to match terminal look)
- Modal/non-modal: blocks input to terminal while open

### 9. Ring Persistence (Optional)
- Option to persist ring across sessions (encrypted file)
- Path: `~/.config/gemra/clipboard_history.json` (or binary format)
- Limit by: entry count, total size, age (e.g., keep <1000 or <7 days)
- Security: Option to exclude sensitive patterns (passwords, tokens)
- Format: simple JSON with timestamp, text, maybe source
  ```json
  {"entries": [{"ts": 1700000000, "text": "..."}]}
  ```
- Load on startup (async, don't block), merge with in-memory ring

### 10. Fuzzy Search
When filtering in picker:
- Tokenize by word boundaries
- Match scored with fza/fzy algorithm
- Highlight matched characters
- Sort by score (not just recency)

### 11. Integration with Selection
- Selection → ring entry type: `Selection`
- Pasting a ring entry clears current selection
- Can also copy from ring into selection (Cmd+Shift+C on picked entry)

## Configuration
```json
{
  "clipboard": {
    "ring_size": 30,
    "max_entry_bytes": 1_000_000,
    "persist": false,
    "persist_path": "~/.config/gemra/clipboard_history.json",
    "sync_with_system": true,
    "deduplicate": true,
    "filter_sensitive_patterns": [
      "password\\s*=",
      "AWS_SECRET",
      "-----BEGIN PRIVATE KEY-----"
    ]
  },
  "keybindings": {
    "paste_ring_picker": "shift+cmd+v",
    "paste_ring_next": "ctrl+cmd+v"
  }
}
```

## Implementation Plan
1. `ClipboardRing` struct with ring buffer and deduplication
2. Modify `handleCopy` to add to ring instead of single buffer
3. Add `pasteFromRing(index)` method
4. Create `PickerWindow` (Objective-C class) for visual picker
5. Wire picker to keybinding, implement filtering
6. Optional: persistence layer with secure deletion
7. Settings UI/config parsing

## Considerations
- Memory: 30 entries × 100KB avg = 3MB, acceptable
- Privacy: ring in memory only, clear on quit by default
- Performance: ring lookups O(1) by index, O(n) for search (n=small)
- Security: strip ANSI, warn about large pastes

## Alternatives
- Use macOS native pasteboard history (not available in standard API, private)
- External tools (PasteBot, Flycut, Clipy) - but we want integrated
- File-based ring vs in-memory: in-memory for privacy/speed

## Testing
- Copy multiple items, verify ring order (most recent first)
- Paste from ring picks correct entry
- Picker search filters accurately
- Deduplication works (copy same text twice → single entry)
- System clipboard sync works bidirectionally
- Large paste truncated/respected
- Persist/load cycle preserves correct order and timestamps
