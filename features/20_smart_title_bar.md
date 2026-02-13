# Feature 20: Smart Window Title Updates (Dynamic Tab Titles)

## Overview
Automatically update the terminal window title based on current context (current command, working directory, remote host, git branch) with user-configurable templates and heuristics, improving window management and reducing cognitive load when working with multiple terminals.

## Problem
Window title is static ("gemra"). Users with multiple terminal windows can't distinguish them quickly.
- Title should reflect current task/process
- Should update in real-time as user navigates
- Must integrate with shell integration (PS1, prompt) and terminal title sequences (OSC 2)

## Proposed Solution

### 1. Title Update Sources (Priority Order)

1. **OSC 2 / xterm title sequences**: Application sets explicit title via `\e]2;My Title\e\\` → highest priority, use as-is
2. **Shell integration (if available)**: zsh/bash fish modules that report current command/cwd → dynamic
3. **PTY command heuristics**: Look at foreground process from `/proc` or `ps` on parent pid
4. **Fallback**: static from config or window title

### 2. Implementation

#### OSC 2 Handler
In `terminal.zig`, intercept OSC 2:
```zig
fn handleOscTitle(self: *GemraHandler, params: []const u8) void {
    const title = params;  // May need unescaping
    self.terminal.setTitle(title);
}
```

Expose to window:
```zig
terminal.setTitle(text: []const u8) void {
    self.title_buf = text;  // Update ring-buffer title
    // Notify window to update NSWindow.title
    if (self.title_callback) |cb| cb(self.title_buf);
}
```

#### Shell Integration
Support:
- **zsh**: `precmd` hook sends `\e]0;${HOST}: ${PWD}\e\\`
- **bash**: `PROMPT_COMMAND='echo -ne "\033]0;${HOST}: ${PWD}\007"'`
- **fish**: `function fish_prompt; printf '\e]0;%s: %s\a' (prompt_hostname) (prompt_pwd); end`

No extra work; these already work if app sends OSC 2.

But we want smarter: parse title to extract components.

#### Process Inspection
When no explicit title, query foreground process:
- macOS: `proc_pidinfo`, `kinfo_proc` → get `pbi_comm`
- POSIX: `ttyname`, fstat `/proc/self/fd` to find controlling tty, then find foreground process group

Ghostty has helpful utilities: check `src/terminal/process.zig`? Maybe.

Simpler: read `\e[6n` (DSR CPR) response? Not reliable.

Better: rely on shell integration. Users can install `gemra-shell-integration` script.

### 3. Title Template System

User config:
```json
{
  "title": {
    "format": "{host}: {dir} — {command}",
    "max_length": 60,
    "ellipsize": "end",  // "start", "middle", "end"
    "show_git_branch": true,
    "show_ssh_indicator": true,
    "ssh_indicator": "⚡ ",
    "git_indicator": " "  # powerline symbol
  }
}
```

Variables:
- `{host}`: remote hostname if SSH, else local hostname (short)
- `{user}`: username
- `{dir}`: current working directory (basename or full path, `dir_abbrev` config)
- `{command}`: current foreground command (basename of argv[0])
- `{ssh}`: "⚡" if SSH session active
- `{git}`: current git branch if in repo, else empty

**Example**:
- Local: `localhost: ~/projects/gemra — zig build`
- SSH: `server.example ⚡: /var/www — vim main.c`
- Git repo: `localhost: src —  main/feat-x`

#### Template Rendering
```zig
fn renderTitle(ctx: *AppContext) []const u8 {
    const term = &ctx.term.inner;
    const shell_state = term.shell_integration orelse return default_title;

    const host = if (shell_state.ssh_active) shell_state.remote_host else shell_state.local_host;
    const dir = abbreviatePath(shell_state.cwd, config.title.dir_abbrev);
    const command = shell_state.current_command orelse "";
    const git = if (config.title.show_git_branch) shell_state.git_branch orelse "";

    return std.fmt.allocPrint(
        allocator,
        config.title.format,
        .{ .host = host, .dir = dir, .command = command, .git = git, .ssh = ssh_indicator(term) }
    ) catch default_title;
}
```

### 4. Shell Integration Module

Provide `gemra-shell-integration` script for zsh/bash/fish:
- Detect if inside gemra via `TERM_PROGRAM=Gemra` or env var
- Install `precmd`, `chpwd`, `preexec` hooks
- Send OSC sequences with structured JSON? Or just set title directly.

Better: use structured data channel (maybe ANSI escape codes with private mode).
Simplify: send OSC 2 directly; our OSC 2 handler captures and also parses for components.

Format:
```
\e]2;host=example.com;dir=/home/user/project;cmd=vim;git=main\e\\
```
Our parser extracts components into shell_integration struct.

If user's PS1 already sets title, we still respect it (existing behavior). This is enhancement.

### 5. Git Branch Detection
Lightweight: run `git branch --show-current` in cwd?
- Heavy: spawns process, slow
- Better: watch file system events, maintain state with `libgit2` or `ziggit`
- For dynamic titles, update on directory change or every N seconds (cached)
- This is complex; maybe optional feature behind Lua plugin

Simpler: shell integration script handles git (via `__git_ps1` or `git_prompt_info`) and embeds in OSC 2.

So we only parse; don't compute ourselves.

### 6. Title Update Frequency
- On directory change (chdir, cd)
- On command start (preexec hook)
- On prompt (precmd)
- On SSH connect/disconnect (detect from hostname)
- On OSC 2 sequence (immediate)

Debounce rapid updates (multiple chdirs) to 200ms.

### 7. Multiple Windows/Tabs
Each tab has own title. System tab bar uses tab title:
- Use `window.setTabTitle(title)` (macOS 10.13+)
- Window title (when not tabbed) shows active tab's title

Update on tab switch too.

### 8. Title Ellipsization
If title too long for menu bar (approximate 80 chars):
- Config: `ellipsize = "middle"` → "myproj…/src/main.zig"
- Truncate path component by component
- Preserve important parts (git branch, command) at end if possible

### 9. SSH Indicator
Detect SSH: `SSH_CONNECTION` or `SSH_TTY` env vars set.
Title prefix: config.ssH_indicator (emoji or "[SSH]").
Only show if not already in hostname (i.e., remote host shown).

### 10. Configuration Migration
Current simple `"title": "gemra"` config.
- Support legacy: if `title` is string, use as fixed title (no template)
- If `title` is object with `format`, use new system

### 11. Observability
Debug command: `:debug title` → show current title components and template expansion.

### 12. Command Line Override
User can manually set title:
```
:title My Custom Title
```
Or via escape: `printf '\e]2;My Title\e\\'`

### 13. Performance
Title updates happen on PTY thread (IO thread). Must not block.
- Use ring buffer of recent titles (snapshot for render thread)
- Actually title displayed in window UI (native), not rendered by us
- Only need to call `[window setTitle:]` on main thread
- Use `dispatch_async(dispatch_get_main_queue(), ^{ ... })` in ObjC

### 14. Implementation in window.zig
Add title callback in AppContext:
```zig
pub const TitleCallback = *const fn (text: []const u8) void;

pub const AppContext = struct {
    // ...
    title_callback: ?TitleCallback = null,
};

fn titleUpdated(text: []const u8) void {
    // Called from terminal thread with new title
    // Should dispatch to main thread
    const ns_str = ...NSString from text...
    dispatch_async(dispatch_get_main_queue(), ^{
        [window setTitle:ns_str];
    });
}
```

### 15. Testing
- Run `printf '\e]2;Test Title\e\\'` → window title "Test Title"
- Run vim, check title changes to file name
- SSH to remote, check indicator appears
- Git repo, check branch appears
- Tab switching, check title updates per tab

### 16. Edge Cases
- **Title too long**: truncate safely
- **Non-ASCII**: Ensure UTF-8, maybe truncate by graphemes not bytes
- **Cycle loops**: shell hook also sets title, our auto might conflict → need priority
- **Tmux**: If tmux sets title, we should respect (OSC 2) without override

### 17. Alternatives
- Always show full path: too long, not useful
- Never change title: some users prefer static
- Use only shell integration: too platform dependent

Our hybrid approach: explicit OSC 2 wins, otherwise template with heuristic fallbacks.

### 18. Documentation
- Document how to enable shell integration for each shell
- Show template variables
- Example config for common workflows (SSH-heavy, git-heavy, etc.)

## References
- XTerm title sequences (OSC 0, 2)
- iTerm2 title setting
- GNOME Terminal dynamic title
- Oh-my-zsh theme conventions

## Benefit
- At-a-glance identification of terminal content
- Reduced confusion with multiple windows/tabs
- Better workflow context

Implementation effort: medium (mostly glue code, parsing, template engine).
