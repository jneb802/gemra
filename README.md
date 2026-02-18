# Gemra

A terminal emulator with a built-in Claude AI assistant. Run shell commands and chat with Claude side by side, in the same app.

## Setup

**Requirements:** Node.js 18+, macOS

```bash
cd electron/
npm install
npx electron-rebuild -f -w node-pty
npm run dev
```

That's it. The app will open in development mode with hot reload.

## Building

```bash
# Package for macOS
npm run package:mac
```

The DMG will be output to `electron/release/`.

## License

Apache 2.0
