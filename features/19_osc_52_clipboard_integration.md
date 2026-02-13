# Feature 19: Full OSC 52 Clipboard Integration

## Overview
Implement comprehensive OSC 52 clipboard control, allowing applications inside the terminal to read from and write to the system clipboard directly, enabling seamless clipboard operations in SSH sessions, tmux, vim, and remote development workflows.

## Problem
Standard terminal copy/paste uses Cmd+C/Cmd+V which only works for local selection.
- SSH sessions: remote app can't access local clipboard
- Vim inside tmux: yanks don't reach system clipboard
- tmux buffer doesn't sync with system
- Need external tools (xclip, pbcopy, xsel, OSC 52 support in terminal)

## Proposed Solution

### 1. OSC 52 Protocol
OSC 52 sequences:
- **Set clipboard**: `\e]52;c;base64:...\e\\` (c = clipboard, p = primary)
- **Get clipboard**: `\e]52;c;?\e\\` → terminal responds with current clipboard contents encoded

Implement in `terminal.zig` handler.

### 2. Clipboard Modes
Three modes in config:
```zig
clipboard {
    osc52 = "enabled"  # "enabled", "disabled", "restricted"
    # restricted = only respond to programs from trusted paths (e.g., inside tmux)
}
```

- **Enabled**: All apps can read/write clipboard via OSC 52
- **Disabled**: Ignore OSC 52 (default for security)
- **Restricted**: Only respond if PTY belongs to tmux/ssh session (heuristic)

### 3. Security Considerations
OSC 52 can exfiltrate data:
- Malicious program could `\e]52;c;?` repeatedly to monitor clipboard changes
- Could steal passwords, tokens
- Could write malicious data to clipboard (swap attack)

Mitigations:
- **Prompt on first use**: For first OSC 52 request from a given process/PID, ask user:
  "Allow `vim` to access clipboard? [Y/n/always/never]"
- **Per-session allowlist**: Remember user's choice per command
- **Rate limiting**: Max 5 requests per minute per session
- **Content size limit**: Max 1MB per transfer (configurable)
- **Strip NUL bytes**: Security measure

### 4. Implementation

#### Handling Set Clipboard
```zig
fn handleOscSetClipboard(self: *GemraHandler, params: []const u8, payload_base64: []const u8) void {
    if (self.clipboard_mode == .disabled) return;

    // Rate limit check
    if (rateLimited(self.term, "osc52")) return;

    // Decode base64
    const decoded = std.base64.Decoder.urlSafe.decode(allocator, payload_base64) catch |err| {
        std.log.err("OSC52 base64 decode failed: {}", .{err});
        return;
    };
    defer allocator.free(decoded);

    if (decoded.len > config.clipboard.max_bytes) {
        std.log.warn("OSC52 clipboard too large: {} bytes (max {})", .{decoded.len, config.clipboard.max_bytes});
        return;
    }

    // Strip NUL bytes (security)
    const clean = stripNulBytes(decoded);

    // Apply to system clipboard
    copyToClipboard(clean);

    // Respond with `\e]52;c;OK\e\\` if requested? Optional.
}
```

#### Handling Get Clipboard
```zig
fn handleOscGetClipboard(self: *GemraHandler) void {
    if (self.clipboard_mode == .disabled) return;

    // Rate limit
    if (rateLimited(self.term, "osc52")) return;

    // Read system clipboard
    const text = readFromClipboard() orelse return;

    // Base64 encode
    var b64 = std.base64.Encoder.urlSafe.init(allocator);
    defer b64.deinit();
    const encoded = b64.string(text) catch return;

    // Write response: \e]52;c;base64data\e\\
    const response = try std.fmt.allocPrint(allocator, "\x1b]52;c;{s}\x1b\\", .{encoded});
    defer allocator.free(response);

    _ = posix.write(self.pty_fd, response) catch {};
}
```

### 5. User Experience

#### Prompt Dialog
First time vim asks for clipboard:
```
┌─────────────────────────────────────────────┐
│ Allow vim to access clipboard?              │
│ [Yes] [No] [Always for vim] [Never for vim]│
└─────────────────────────────────────────────┘
```

Show:
- Application name (from `ps` or argv[0])
- PID
- Option buttons

Store in allowlist: `{process: "vim", pid: 12345, allow: true, timestamp: ...}`

#### Visual Indicator
When OSC 52 used:
- Brief status bar overlay: "Copied to clipboard"
- Or notification center message (macOS UserNotifications)
- Config: `clipboard.osc52_notification = true`

### 6. tmux Integration
Most use case: tmux wants clipboard access.
- tmux sets `set-option -g set-clipboard on` → uses OSC 52
- Combined with `set -g default-command $SHELL` inside gemra
- Works if OSC 52 enabled

Better: auto-detect tmux:
```zig
if (std.mem.indexOf(u8, current_command, "tmux") != null) {
    // User likely inside tmux; maybe enable OSC 52 automatically?
    // But could be false positive
}
```

### 7. SSH Forwarding
If connected via SSH, OSC 52 should forward through SSH?
- No. OSC 52 writes to local terminal's clipboard, not remote.
- Remote app sends OSC 52 to us → we write to local clipboard.
- Works across SSH automatically. That's the point.

**But** security: remote host could exfiltrate data via OSC 52 get request.
So prompt/rate-limit important for SSH sessions too.

### 8. Primary Selection (X11 term)
Clipboard vs Primary:
- Clipboard: Cmd+C/Cmd+V (explicit copy/paste)
- Primary: Mouse selection auto-copies, middle-click pastes (X11 tradition)

OSC 52 supports both: `c` (clipboard) and `p` (primary).
Configuration:
```zig
clipboard {
    osc52_primary = false  # Default: ignore primary selection
}
```

### 9. Clipboard Persistence
When app requests clipboard, we read system clipboard (from NSPasteboard).
System clipboard persists after our app exits (macOS maintains).
So no special handling needed.

### 10. Configuration Schema
```json
{
  "clipboard": {
    "osc52": "prompt",  // "enabled", "disabled", "prompt"
    "primary": false,
    "max_bytes": 1048576,
    "rate_limit_per_min": 10,
    "show_notifications": true,
    "allowlist": [
      {"command": "vim", "allow": true},
      {"command": "tmux", "allow": true}
    ]
  }
}
```

### 11. Testing
- Vim: `"+y` should trigger OSC 52 → system clipboard
- Vim: `"+p` should read system clipboard via OSC 52 get (if configured)
- Tmux: `set-option -g set-clipboard on` → copy in tmux copies to system
- Remote host: `echo test | base64` → OSC 52 set → local clipboard has "test"
- Rejection: disable OSC 52 → vim clipboard ops do nothing (fallback to xterm-clipboard if available)

### 12. Edge Cases
- **Large clipboard**: >1MB → reject with error to app (OSC 52 response `\e]52;c;error:too_large\e\\`)
- **Binary data**: Base64 encodes fine, but clipboard may not support binary (macOS only text/UTI). Convert to text if needed.
- **Unicode normalization**: macOS stores as UTF-8; ensure consistent
- **Clipboard formats**: Rich text? Only plain text support.

### 13. Alternatives Considered
- **External helper**: `pbcopy`/`pbpaste` via SSH? No network auth.
- **tmux clipboard integration**: tmux set-clipboard option can use OSC 52 directly if we enable.
- **xclip/xsel**: Not for macOS, only X11.

OSC 52 is standard (xterm, iTerm2, Kitty, WezTerm all support). Should be safe.

### 14. Conflict with Cmd+C/Cmd+V
Both mechanisms coexist:
- Cmd+C/Cmd+V bypass terminal (handled by our window's keyDown)
- OSC 52 bypasses Cmd bindings (app sends escape seq directly)
- No conflict; both write to same system clipboard (NSPasteboard)

### 15. Implementation Steps
1. Add clipboard_mode config option
2. Implement OSC 52 parser in GemraHandler (send to pty)
3. Add rate limiter (token bucket per session)
4. Add allowlist UI/prompt (or just config for now)
5. Add tests for base64 encode/decode
6. Verify with vim `"+y` inside and outside tmux

## References
- xterm OSC 52 documentation: https://invisible-island.net/xterm/ctlseqs/ctlseqs.html#h3-Operating-System-Command
- iTerm2 OSC 52 implementation: https://iterm2.com/documentation-osc52.html
- WezTerm OSC 52: https://wezfurlong.org/wezterm/clipboard.html

## Security Warning
OSC 52 is powerful but risky. Must be opt-in or carefully controlled. Default to disabled or prompt. Document security implications in README.
