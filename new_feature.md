# Engineering Task: Implement Tabbed Interface (Terminal Emulator)

## 1. Goal

Introduce a tabbed interface so users can manage multiple independent terminal sessions (PTY + shell process + emulator state) within a single window. Each tab owns its own PTY/session and terminal grid state, while the window UI renders the active tab.

## 2. Background and Research

*   **Terminal emulation core: zvterm / libvterm**
    *   `zvterm` is a Zig wrapper around `libvterm` intended to be “just enough to build a working toy terminal emulator,” where you feed it escape codes and get a grid of colored/styled cells back.
    *   `libvterm` is explicitly toolkit-agnostic: it parses VT220/xterm-style sequences and uses callbacks/embedding APIs so your app can render however it wants.

*   **PTY + I/O loop reference: Ghostty**
    *   Ghostty is a Zig terminal emulator; its `src/pty.zig` is the canonical reference for PTY lifecycle + integration points.
    *   Ghostty’s docs describe a multi-threaded terminal I/O system and event loop approach for throughput/latency.

## 3. Proposed Implementation Plan

### Task 1: Integrate zvterm (libvterm) as the terminal core

**Objective:** Create a reusable “TerminalCore” wrapper that turns bytes from the PTY into a screen model you can render.

*   **Sub-task 1.1: Add dependency + minimal prototype**
    *   Add `zvterm` to `build.zig.zon` and link its C dependency requirements (as needed by the repo).
    *   Build the minimal example equivalent of `examples/helloworld.zig`: initialize a terminal grid, write escape sequences, confirm you can read back cells.

*   **Sub-task 1.2: Define your emulator abstraction**
    *   Create a Zig module (example shape):
        *   **`TerminalCore`**:
            *   owns `ZVTerm` instance (rows/cols)
            *   exposes `feed(bytes)` → updates internal grid via `zvterm`/`libvterm` parsing
            *   exposes `getCell(row,col)` or “iterate dirty regions” to support efficient rendering
        *   **`resize(rows, cols)`**:
            *   resizes `zvterm` + triggers PTY resize (later in PTY task)
    *   **Key design decision:** treat `zvterm` as “pure emulation state,” with rendering entirely outside it. That’s aligned with `libvterm`’s “no graphics toolkit” design.

### Task 2: Implement PTY + subprocess lifecycle (follow Ghostty pattern)

**Objective:** Each tab gets a real PTY, a child process (shell/command), and a non-blocking I/O loop.

*   **Sub-task 2.1: PTY allocation + spawn**
    *   Implement `PtySession` (modeled after Ghostty `pty.zig` organization):
        *   allocate PTY master/slave
        *   spawn child process attached to slave
        *   store master fd/handle for I/O
    *   Ensure cross-platform considerations are isolated behind `os/` modules (Ghostty does this extensively; even if you only target Unix first, keep the boundary clean).

*   **Sub-task 2.2: I/O loop architecture**
    *   Following Ghostty’s “terminal I/O system” and event-loop/threading approach:
    *   Create a dedicated I/O thread (or async loop) per session (or shared worker) that:
        *   reads from PTY master → emits byte chunks
        *   writes user input bytes to PTY master
    *   Use a thread-safe queue/channel:
        *   `pty_outgoing_bytes` → consumed by main/UI thread → fed into `TerminalCore.feed()`
        *   `pty_incoming_input` → produced by main/UI thread → consumed by I/O thread → written to PTY

*   **Sub-task 2.3: Resize propagation**
    *   When the window content area changes (or font size changes):
        *   compute `rows/cols`
        *   call `TerminalCore.resize(rows, cols)`
        *   issue PTY `TIOCSWINSZ` (or platform equivalent) so the child process receives `SIGWINCH` / resize semantics.

### Task 3: Window/UI renderer and input routing (no TUI framework)

**Objective:** You are building the terminal emulator window, so the UI layer is yours.

*   **Sub-task 3.1: Define a render model**
    *   `RenderSurface` reads the active tab’s `TerminalCore` grid and draws:
        *   glyphs (font rasterization)
        *   colors/styles (bold/italic/underline)
        *   cursor
        *   selection highlights
    *   Add “damage tracking”:
        *   If `zvterm`/`libvterm` exposes changed regions (or you track it), render only dirty rows/rects; otherwise start with full redraw then optimize.

*   **Sub-task 3.2: Input translation**
    *   Keyboard events → encode into the correct bytes (including modifiers) → push into session `pty_incoming_input`.
    *   Mouse events:
        *   selection (local)
        *   optional: report mouse mode sequences to PTY when the app requests it (later feature)

### Task 4: Tabs: data model + tab bar UI + session binding

**Objective:** Tabs are a UI concept, but each tab owns a full session.

*   **Sub-task 4.1: Tab data structures**
    *   `Tab` struct contains:
        *   `title` (dynamic: cwd/process name, etc.)
        *   `session: *PtySession`
        *   `term: *TerminalCore`
        *   UI state: scrollback position, selection, etc.
    *   `TabManager`:
        *   `ArrayList(Tab)`
        *   `active_index`
        *   operations: `add`/`close`/`switch`/`move`/`rename`

*   **Sub-task 4.2: Tab bar UI**
    *   Implement a lightweight tab bar in your window renderer:
        *   render tab strip at top
        *   active/inactive styling
        *   close button hit targets
    *   Interaction:
        *   mouse click to activate/close
        *   drag reorder (optional)

*   **Sub-task 4.3: Routing rules**
    *   Only **active tab** receives:
        *   keyboard input
        *   mouse-to-PTY reporting
    *   **Background tabs** still run:
        *   their I/O threads keep reading from PTY and feeding their own `TerminalCore`
        *   they accumulate scrollback/output while inactive

### Task 5: Keybindings + user interactions

**Objective:** Provide standard tab UX + session lifecycle correctness.

*   **Sub-task 5.1: Keyboard shortcuts**
    *   Implement conventional bindings:
        *   New tab: `Cmd+T` (mac) / `Ctrl+Shift+T` (others)
        *   Close tab: `Cmd+W` / `Ctrl+Shift+W`
        *   Next/prev tab: `Cmd+Shift+]` / `[` or `Ctrl+PageDown` / `PageUp`
        *   Direct tab select: `Cmd+1..9` etc.

*   **Sub-task 5.2: Tab title strategy**
    *   Initial title from launched command (or “Shell”)
    *   Update title from:
        *   OSC sequences (later)
        *   current directory detection (later)
        *   process name heuristics (later)

### Task 6: Shutdown, cleanup, and robustness

**Objective:** No zombie processes, no stuck threads, correct cleanup on close/crash.

*   **Sub-task 6.1: Close tab semantics**
    *   On tab close:
        *   signal child process (graceful)
        *   if not exited after timeout, force kill (platform-specific)
        *   close PTY handles
        *   stop I/O loop cleanly (join thread)
        *   free `TerminalCore`

*   **Sub-task 6.2: App quit semantics**
    *   close all tabs using the same orderly shutdown
    *   ensure the UI thread doesn’t deadlock waiting on I/O threads
    *   Ghostty is a good reference for “system-level correctness” around PTY lifecycle and threading.
