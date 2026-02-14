# Gemra Terminal Emulator

A modern terminal emulator built with Electron, React, and xterm.js.

## Project Structure

This project has been rewritten from the original Zig + Swift implementation
to use Electron for better developer experience and cross-platform support.

**Active implementation:** See `electron/README.md`

**Original implementation (archived in git history):**
- Zig + Swift + Metal GPU rendering
- See git history before February 14, 2026 for the original code
- ~5,000 lines of Zig code in `src/`
- SwiftUI app in `GemraApp/`

## Quick Start

```bash
cd electron/
npm install
npm run dev
```

See `electron/README.md` for complete documentation.

## Architecture

- **Electron 32.x** - Desktop framework
- **xterm.js 5.5.x** - Terminal emulation with WebGL rendering
- **React 18.x** - UI framework
- **TypeScript 5.x** - Type safety
- **node-pty 1.0.x** - PTY management

## Features

- Multiple terminal tabs with smooth transitions
- Split pane support (horizontal/vertical)
- Full VT100/ANSI escape sequence support
- WebGL-accelerated rendering via xterm.js
- Native macOS window chrome
- Keyboard shortcuts for navigation and management

## License

MIT
