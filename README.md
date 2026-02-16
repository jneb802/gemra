# Gemra Terminal Emulator

A modern terminal emulator with integrated Claude Code AI assistant, built with Electron, React, and xterm.js.

## Overview

Gemra is a complete rewrite of the original Zig + Swift implementation, now using Electron for better developer experience and cross-platform support. It combines a full-featured terminal emulator with an integrated Claude AI coding assistant.

**Original implementation (archived in git history):**
- Zig + Swift + Metal GPU rendering
- See git history before February 14, 2026 for the original code

## Quick Start

```bash
cd electron/
npm install

# Rebuild node-pty for Electron (first time only)
npx electron-rebuild -f -w node-pty

# Development mode (hot reload)
npm run dev

# Type checking
npm run typecheck

# Build for production
npm run build

# Package for macOS
npm run package:mac
```

## Technology Stack

- **Electron 32.x** - Desktop app framework
- **xterm.js 5.5.x** (@xterm/xterm) - Terminal emulation
- **@xterm/addon-webgl** - WebGL rendering for 60+ FPS
- **@anthropic-ai/claude-agent-sdk** - Claude Code integration
- **node-pty 1.0.x** - PTY management
- **React 18.x** - UI framework
- **TypeScript 5.x** - Type safety
- **Zustand 4.x** - State management
- **react-resizable-panels** - Split pane UI
- **lucide-react** - Icons
- **Vite + electron-vite** - Build tooling

## Features

### 🤖 Claude AI Integration
- **Integrated AI Assistant** - Claude Code directly in your terminal
- **Multiple AI Models** - Switch between Opus 4.6, Sonnet 4.5, or Haiku 4.5
- **Agent Modes** - Default, Accept Edits (auto-accept file changes), and Plan mode
- **Smart Input Detection** - Auto-detect command vs AI input, or manually switch with Cmd+K
- **Slash Commands** - Built-in commands for workflow efficiency:
  - `/help` - Show all available commands
  - `/clear` - Clear chat history
  - `/mode <mode>` - Switch agent mode (default/acceptEdits/plan)
  - `/model <model>` - Switch AI model (opus/sonnet/haiku)
  - `/new-terminal` - Open new terminal tab
  - `/new-chat` - Start new chat session
  - `/git-status` - Show git status
  - `/checkout` - Interactive branch switcher
  - `/branch <name>` - Create new git branch
- **Screenshot Attachments** - Drag & drop or attach images to messages
- **Git Integration** - Real-time branch tracking, change monitoring, clickable branch switcher
- **Docker Support** - Optional container isolation for agent operations
- **Status Bar** - Token usage tracking, git stats, model/mode indicators
- **Message Queue** - Send multiple messages while agent is working

### 🖥️ Terminal Features
- Core terminal emulation with xterm.js + WebGL rendering (60+ FPS)
- Multi-tab support (Claude chat tabs + regular terminal tabs)
- Enhanced text selection and clipboard integration
- Split panes (horizontal/vertical) with resizable dividers
- Native macOS menu bar with all shortcuts
- Preferences UI with font, cursor, and theme settings
- Full VT100/ANSI escape sequence support
- 10,000 line scrollback buffer (configurable)

## Keyboard Shortcuts

### Tabs
- **Cmd+T** - New Claude chat tab
- **Cmd+Shift+T** - New terminal tab
- **Cmd+W** - Close tab/pane
- **Cmd+1-9** - Switch to tab 1-9
- **Cmd+Shift+[** - Previous tab
- **Cmd+Shift+]** - Next tab

### Claude AI
- **Cmd+K** - Cycle input mode (Auto → Command → AI)
- **/** - Trigger slash command menu
- **Tab** - Switch between Custom/Claude command tabs
- **↑/↓** - Navigate command menu
- **Enter** - Execute selected command
- **Esc** - Close command menu

### Split Panes
- **Cmd+D** - Split horizontally
- **Cmd+Shift+D** - Split vertically
- **Cmd+[** - Previous pane
- **Cmd+]** - Next pane

### Clipboard
- **Cmd+C** - Copy (when text selected)
- **Cmd+V** - Paste
- **Cmd+A** - Select all

### Other
- **Cmd+,** - Preferences

## Architecture

```
Main Process (Node.js)          Renderer Process (Chromium)
├─ WindowManager                ├─ React App
├─ PtyManager (node-pty)        ├─ Multi-tab UI (Zustand)
├─ ClaudeAgentManager           ├─ Claude chat UI
├─ MenuBuilder                  │  ├─ Message list
└─ IPC handlers                 │  ├─ Input box with slash commands
         ↕ IPC (contextBridge) ↕│  └─ Status bar (git, tokens, model)
                                ├─ Split pane layout (binary tree)
                                ├─ xterm.js with WebGL
                                └─ Preferences modal
```

## Project Structure

```
electron/
├── src/
│   ├── main/                         # Main process (Node.js)
│   │   ├── index.ts                  # App entry point
│   │   ├── WindowManager.ts          # Window management
│   │   ├── PtyManager.ts             # PTY spawning/management
│   │   ├── ClaudeAgentManager.ts     # Claude agent lifecycle
│   │   ├── menu/
│   │   │   └── MenuBuilder.ts        # Native menu bar
│   │   └── ipc/
│   │       ├── terminal.ts           # Terminal IPC handlers
│   │       └── claude.ts             # Claude agent IPC handlers
│   │
│   ├── renderer/                     # Renderer process (Chromium)
│   │   ├── App.tsx                   # Main app component
│   │   ├── components/
│   │   │   ├── claude/               # Claude AI components
│   │   │   │   ├── ClaudeChat.tsx    # Main chat UI
│   │   │   │   ├── MessageList.tsx   # Message display
│   │   │   │   ├── InputBox.tsx      # Input with slash commands
│   │   │   │   ├── StatusBar.tsx     # Git/token/model status
│   │   │   │   └── ...
│   │   │   ├── Terminal/             # Terminal components
│   │   │   ├── Tabs/                 # Tab management
│   │   │   ├── SplitPane/            # Split layout
│   │   │   └── Preferences/          # Settings modal
│   │   └── stores/                   # Zustand state
│   │       ├── tabStore.ts
│   │       ├── layoutStore.ts
│   │       ├── settingsStore.ts
│   │       └── inputModeStore.ts
│   │
│   ├── preload/                      # Preload script
│   │   └── index.ts                  # contextBridge API
│   │
│   └── shared/                       # Shared types
│       └── types.ts
```

## Claude Agent Features

The Claude integration provides a full-featured AI coding assistant:

1. **Conversational Interface** - Natural language interaction with Claude
2. **Tool Use** - Claude can execute bash commands, read/write files, search code
3. **Git Operations** - Built-in git commands and real-time change tracking
4. **Multi-Model** - Switch between Opus (most capable), Sonnet (balanced), Haiku (fastest)
5. **Agent Modes** - Control behavior (default, auto-accept edits, plan-only)
6. **Context Management** - Token usage tracking, intelligent context windowing
7. **Screenshot Support** - Show Claude images/screenshots for debugging
8. **Docker Isolation** - Optional sandboxed execution environment

## Performance

- **Startup time**: ~500ms (acceptable Chromium overhead)
- **Memory per tab**: ~30-40 MB (acceptable for Electron)
- **Rendering FPS**: Solid 60 FPS (WebGL)
- **Bundle size**: ~150 MB packaged app

## Development

The app uses `electron-vite` which provides:
- Hot module replacement (HMR) for renderer
- Fast TypeScript compilation
- Separate optimized builds for main/renderer/preload

### Common Issues & Solutions
- **"Cannot find module 'node-pty'"**: Run `npx electron-rebuild -f -w node-pty`
- **Black screen on launch**: Check console for renderer errors, verify xterm.js initialization
- **PTY not spawning**: Verify main process has proper shell path (e.g., `/bin/zsh`)
- **Keyboard shortcuts not working**: Check menu accelerators in MenuBuilder.ts

## Trade-offs vs Zig/Swift Version

| Aspect | Zig/Swift | Electron | Winner |
|--------|-----------|----------|--------|
| Startup time | ~100ms | ~500ms | Zig/Swift |
| Memory usage | ~15 MB/tab | ~30-40 MB/tab | Zig/Swift |
| Dev velocity | Slow | **Fast** | **Electron** |
| Maintenance | Hard | **Easy** | **Electron** |
| Ecosystem | Limited | **Rich** | **Electron** |
| Cross-platform | macOS only | **All platforms** | **Electron** |

**Verdict**: Electron version wins on developer experience, which was the primary goal!

## Future Enhancements

- [ ] Settings persistence with electron-store (currently in-memory)
- [ ] Custom color schemes for terminal
- [ ] Terminal profiles (shell, env vars per profile)
- [ ] Search in terminal (xterm.js addon available)
- [ ] Tab reordering (drag and drop)
- [ ] Session restore on app restart
- [ ] Claude conversation persistence across sessions
- [ ] Multi-agent support (multiple Claude instances)
- [ ] Custom slash command plugins
- [ ] LiteLLM profile support expansion

## License

MIT
