# Feature 25: Terminal Session Recording and Replay (Asciinema-Compatible)

## Overview
Implement built-in terminal session recording to a portable, text-based format (as asciicast v2) with accurate timing, allowing users to record demos, bug reproductions, or tutorials, and replay them later with perfect fidelity or share online.

## Problem
Currently, no way to record terminal session:
- Users must use external tools (asciinema, script, ttyrec)
- External tools capture at PTY level but may miss rendering details (colors, effects)
- Integration with terminal features (scrollback, annotations) limited
- Want to share recordings with colleagues, embed in docs

## Proposed Solution

### 1. Recording Format: Asciicast v2
Adopt the open asciicast format (https://github.com/asciinema/asciinema/blob/develop/doc/asciicast-v2.md):
- Header line: `{"v":2,"width":80,"height":24,"timestamp":1700000000,"duration":12.34,"command":"zsh","title":"Demo"}`
- Data lines: `[time, "output"],` as JSON array
- Time: float seconds (arbitrary precision)
- Output: string (UTF-8) including escape sequences

Advantages:
- Standard format; can replay on asciinema.org or server
- Text-based, compressible with gzip
- Stores actual PTY output, not screenshots (exact reproduction)
- Human-readable metadata

### 2. Recording Workflow

Start recording:
- `Cmd+Shift+R` → start recording (show indicator in status bar)
- Prompt for title (optional)
- Save to `~/.config/gemra/recordings/YYYY-MM-DD-HH-MM-SS.cast` (or user-specified)

During recording:
- All PTY output captured with timestamps
- Metadata accumulated: command that started, cwd, duration
- Indicator overlay: red dot with REC text

Stop recording:
- `Cmd+Shift+R` again
- Finalize file (write footer duration)
- Optionally compress (gzip)
- Show notification with file path and "Open in browser" (if asciinema server configured)

### 3. Implementation

#### Capture Loop
In `ioLoop` (or separate capture task):
```zig
const CaptureState = struct {
    file: std.fs.File,
    start_time: i128,
    last_time: i128,
    recording: bool = false,

    pub fn start(self: *CaptureState, path: []const u8, title: []const u8) !void {
        self.file = try std.fs.cwd().createFile(path, .{});
        self.start_time = std.time.nanoTimestamp();
        self.last_time = self.start_time;
        self.recording = true;

        // Write header JSON
        const term = &ctx.term.inner;
        const header = std.json.stringify(.{
            .v = 2,
            .width = term.cols,
            .height = term.rows,
            .timestamp = @as(f64, @floatFromInt(self.start_time)) / 1e9,
            .duration = 0,
            .command = "shell", // from env or process name
            .title = title,
        }, .{});
        try self.file.writeAll(header);
        try self.file.writeAll("\n");
    }

    pub fn feed(self: *CaptureState, data: []const u8, now: i128) void {
        if (!self.recording) return;

        const elapsed: f64 = @as(f64, @floatFromInt(now - self.start_time)) / 1e9;
        const last_elapsed: f64 = @as(f64, @floatFromInt(self.last_time - self.start_time)) / 1e9;
        self.last_time = now;

        // Only write if there was non-zero time gap to avoid huge files?
        // Better: always write with actual timestamp; compression will handle repeats

        // JSON array line: [elapsed, "base64 or raw string?"]
        // Asciicast v2 expects string output (not base64)
        const line = std.fmt.allocPrint(allocator, "[{d:.6},\"{s}\"]\n", .{elapsed, data}) catch return;
        _ = self.file.writeAll(line) catch {};
    }

    pub fn stop(self: *CaptureState) void {
        self.recording = false;
        const end_time = std.time.nanoTimestamp();
        const duration: f64 = @as(f64, @floatFromInt(end_time - self.start_time)) / 1e9;
        // Could rewrite header with final duration, but not necessary (replayer can compute)
        self.file.close();
    }
};
```

Integrate into I/O loop after reading from PTY:
```zig
fn ioLoop(/* args */) void {
    while (true) {
        const n = pty.read(&buf) catch ...;
        if (n > 0) {
            // Existing: term.feed(buf[0..n])
            if (ctx.capture.recording) {
                ctx.capture.feed(buf[0..n], std.time.nanoTimestamp());
            }
        }
    }
}
```

### 4. Replay

Replay can be done:
- Internally: built-in player overlay
- Externally: upload to asciinema server, use asciinema CLI to play
- Built-in: for convenience, verify recording

#### Built-in Replay UI
- `Cmd+Shift+[` → open replay picker
- Select recording → play in overlay window
- Controls: play/pause, speed (0.5x, 1x, 2x), seek slider
- Shows terminal content exactly (replay escape sequences through fake PTY?)

Simpler for MVP: just play by feeding data back into terminal with timing.

Implementation:
```zig
const CastReplayer = struct {
    header: Header,
    events: std.ArrayList(Event), // (timestamp, data[])
    current_time: f64 = 0,
    playing: bool = false,

    pub fn load(alloc: std.mem.Allocator, path: []const u8) !CastReplayer {
        const file = try std.fs.cwd().openFile(path, .{});
        defer file.close();
        // Parse header (first line)
        // Parse subsequent lines as JSON events
        // Store in memory (if small enough) or stream
    }

    pub fn update(self: *CastReplayer, delta_time: f64) void {
        if (!self.playing) return;
        self.current_time += delta_time;
        // Emit all events with timestamp <= current_time
        while (self.event_index < self.events.len and self.events[self.event_index].time <= self.current_time) {
            // Send event.data to terminal (feed())
            self.event_index += 1;
        }
    }
};
```

But reusing same terminal would interfere with user's session. Better:
- Open separate `ReplayerWindow` with its own terminal and renderer
- Load recording into that terminal (feed events on schedule)
- Independent from main app

### 5. Recording Settings
```json
{
  "recording": {
    "default_path": "~/.config/gemra/recordings/",
    "auto_compress": true,
    "include_metadata": true,
    "max_duration_seconds": 3600,
    "confirm_before_start": false
  }
}
```

### 6. Asciicast v2 Compliance
Strict requirements:
- Header includes `v` (version), `width`, `height`, `timestamp`, optionally `command`, `title`, `env` (dict)
- Data lines: `[time, string]` JSON arrays, one per line
- `time` in seconds (floating point)
- `string` is UTF-8; escapes `"` and `\` and control chars? Asciicast expects raw string with newline. Must escape newlines? Actually each event is on one line; newline inside string must be escaped as `\n`. Need to JSON-escape.

Implementation:
```zig
fn jsonEscape(alloc: std.mem.Allocator, s: []const u8) ![]u8 {
    var out = std.ArrayList(u8).init(alloc);
    for (s) |c| {
        switch (c) {
            '"' => try out.appendSlice("\\\""),
            '\\' => try out.appendSlice("\\\\"),
            '\n' => try out.appendSlice("\\n"),
            '\r' => try out.appendSlice("\\r"),
            '\t' => try out.appendSlice("\\t"),
            else => {
                if (c < 32) {
                    // Control char: \u00XX
                    try std.fmt.format(out.writer(), "\\u{d:04X}", .{c});
                } else {
                    try out.append(c);
                }
            }
        }
    }
    return out.toOwnedSlice();
}
```

### 7. Sharing and Playback

#### Export formats
- `.cast` (asciicast v2, gzipped optional)
- `.gif` animation export (via `ffmpeg` or external tool)
- `.mp4` video (future)

#### Upload to asciinema server
If user configures server:
```
[server]
url = "https://asciinema.example.com"
token = "xxx"
```
Then `:recording upload latest` pushes server and returns shareable link.

### 8. Playback Controls

When replaying:
- Speed multiplier: `[` / `]` keys
- Pause: `Space`
- Seek: arrow keys (left/right = 1s, Shift+Arrow = 10s)
- Jump to start/end: Home/End
- Loop: toggle with `L`

### 9. Recording Metadata

Include:
- Start timestamp (UTC)
- Terminal dimensions (cols, rows)
- Shell command and args
- Current working directory (if available)
- Git branch (if in repo)
- User-provided title/description

### 10. Quality Options

Config:
```json
{
  "recording": {
    "capture_input": true,     // Also record keyboard input events? Not in asciicast v2 but possible custom extension
    "capture_mouse": false,    // Mouse events as escape seqs
    "max_frame_time_ms": 50,   // Capture timestamps at least this often (throttle)
    "compress": "gzip",        // or "none", "zstd"
  }
}
```

### 11. Edge Cases
- **Huge recordings**: >1GB? Warn user, maybe split
- **Binary data**: PTY output can contain binary; asciicast expects text. Encode as base64 (v2 extension)? Or skip binary control chars.
  - Problem: images (Sixel) would be huge and not meaningful in text replay. Option: omit or record as placeholder.
- **Resize during recording**: asciicast v2 includes fixed width/height; if resized, recordings may misinterpret later. Better: record initial size only; if resized during, note it but replay at original size.

### 12. Integration with Shell
- Shell integration could send OSC 1337 ScreenStarted/Finished? Not needed.
- Recordings don't depend on shell; pure PTY output.

### 13. Playback with Scrollback

When replaying, should we allow scrolling back? Yes, asciicast replay is linear but we can buffer all frames and allow scroll. Actually asciicast is time-based; you can't scroll ahead of playback. To allow scrollback: buffer all output up to current time, allow free scrolling. But that's complex. Simpler: linear playback only (like asciinema). Users can pause and scroll through buffered content.

Our terminal already has scrollback buffer; just feed events respecting time, and scrolling works naturally (since buffer accumulates). So yes, scrollback works!

### 14. Implementation Steps

1. Define `Recorder` struct with file handle, state
2. Modify `ioLoop` to capture PTY output (after terminal.feed or before? Before, to capture raw bytes exactly)
3. Add keybinding to start/stop
4. Write asciicast v2 JSON lines correctly
5. Add replayer window (separate NSWindow with its own terminal/renderer)
6. Add control UI (overlay or separate panel)
7. Settings integration (path, compression)
8. Testing: record, stop, replay; verify timestamps and content match
9. Optional: upload to server

### 15. References
- Asciicast v2 spec: https://github.com/asciinema/asciinema/blob/develop/doc/asciicast-v2.md
- asciinema CLI source (Go)
- ttyrec format (legacy)
- script(1) command format

## Benefits
- Native recording without external tools
- Shareable format plays on web
- Low overhead, text-based
- Perfect reproduction including escape codes

Competitive with iTerm2's "Save screen output" and WezTerm's `record` feature.
