# Agent Client Protocol (ACP) Research Summary

## What is ACP?

The **Agent Client Protocol** is a JSON-RPC based protocol created by Zed that standardizes communication between code editors/IDEs and AI coding agents.

### Key Features
- **Open standard** created by Zed, now part of the Linux Foundation
- **JSON-RPC over stdio** for local agents
- **HTTP/WebSocket** support for remote agents (work in progress)
- **Language agnostic** with SDKs in TypeScript, Python, Rust, and Kotlin

### How It Works

```
Editor/IDE (ACP Client)
    ↓ JSON-RPC over stdio (NDJSON)
Agent (ACP Server)
    ↓ Uses internally
Claude Agent SDK or other agent implementation
    ↓ API calls
LLM Provider (Anthropic, OpenAI, etc.)
```

## Two Integration Approaches

### Option 1: Use ACP (Standardized Protocol)

**Implementation:** Use `@zed-industries/claude-code-acp`

**Pros:**
- Standardized protocol - works with any ACP agent (Claude, Gemini CLI, Codex, etc.)
- Battle-tested by Zed
- Clean separation of concerns
- Future-proof as protocol evolves

**Cons:**
- More complex - requires spawning external process
- Communication via JSON-RPC over stdio
- Less direct control
- Dependency on external binary

**Example:**
```typescript
// Spawn claude-code-acp process
const agent = spawn("claude-code-acp", [], {
  stdio: ["pipe", "pipe", "pipe"],
  env: { ANTHROPIC_API_KEY: apiKey }
});

// Send NDJSON messages
agent.stdin.write(JSON.stringify({
  jsonrpc: "2.0",
  method: "agent/start",
  params: { prompt: "Fix the bug" }
}) + "\n");

// Receive NDJSON responses
agent.stdout.on("data", (data) => {
  const messages = data.toString().split("\n").filter(Boolean);
  messages.forEach(msg => {
    const parsed = JSON.parse(msg);
    // Handle agent response
  });
});
```

### Option 2: Use Claude Agent SDK Directly (Recommended)

**Implementation:** Use `@anthropic-ai/claude-agent-sdk` directly

**Pros:**
- Much simpler - no external process needed
- Direct control over agent behavior
- Proven by CodePilot
- Easier debugging
- Better integration with Electron

**Cons:**
- Locked to Claude (can't easily swap agents)
- Need to manage own IPC protocol
- More maintenance as SDK evolves

**Example:**
```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

// Clean async generator API
for await (const message of query({
  prompt: "Fix the bug in auth.py",
  options: {
    allowedTools: ["Read", "Edit", "Bash"],
    workingDirectory: "/path/to/project"
  }
})) {
  // Stream messages to UI
  sendToRenderer(message);
}
```

## Recommendation: Direct SDK Approach

**Use the Claude Agent SDK directly** because:

1. **Much simpler architecture** - No process spawning, no stdio communication
2. **Proven approach** - CodePilot successfully uses this pattern
3. **Better DX** - Easier debugging, clearer error messages
4. **Tighter integration** - Full control over agent lifecycle
5. **Can add ACP later** - If we need multi-agent support

## Current Gemra State

Your project already has:
- ✅ Electron + React + TypeScript
- ✅ xterm.js terminal emulator
- ✅ Zustand state management
- ✅ IPC infrastructure (PTY, file browser)

Perfect foundation for adding Claude Agent SDK!

## Next Steps

1. **Review** `SCOPE.md` - High-level project vision
2. **Review** `IMPLEMENTATION.md` - Detailed technical plan
3. **Decide** if you want to proceed with Phase 1 (3-day POC)
4. **Install** Claude Agent SDK and start building

## Example Projects

### Using ACP
- **Zed Editor**: Native ACP integration ([docs](https://zed.dev/docs/ai/external-agents))
- **JetBrains IDEs**: Coming soon with ACP support
- **Obsidian Plugin**: [obsidian-agent-client](https://github.com/RAIT-09/obsidian-agent-client)

### Using Direct SDK
- **CodePilot**: Electron + Next.js GUI ([repo](https://github.com/op7418/CodePilot))
- **Opcode**: Tauri desktop app ([repo](https://github.com/winfunc/opcode))
- **CloudCLI**: Web-based UI ([repo](https://github.com/siteboon/claudecodeui))

## Resources

**ACP Documentation:**
- [ACP GitHub Repo](https://github.com/agentclientprotocol/agent-client-protocol)
- [ACP Website](https://agentclientprotocol.com)
- [Zed's ACP Docs](https://zed.dev/acp)

**Claude Agent SDK:**
- [Official Docs](https://platform.claude.com/docs/en/api/agent-sdk/overview)
- [TypeScript SDK](https://github.com/anthropics/claude-agent-sdk-typescript)
- [Example Agents](https://github.com/anthropics/claude-agent-sdk-demos)

**Reference Implementations:**
- [claude-code-acp](https://github.com/zed-industries/claude-code-acp) - Zed's ACP adapter
- [CodePilot](https://github.com/op7418/CodePilot) - Direct SDK approach

## Protocol Comparison

| Feature | ACP | Direct SDK |
|---------|-----|------------|
| Agent switching | ✅ Any ACP agent | ❌ Claude only |
| Setup complexity | Higher | Lower |
| Process management | External process | In-process |
| Communication | JSON-RPC/stdio | Direct function calls |
| Debugging | Harder | Easier |
| Control | Limited | Full |
| Future-proof | Protocol standard | SDK updates |
| Best for | Multi-agent IDEs | Single-agent apps |

## Conclusion

For Gemra's use case (dedicated Claude Code UI), the **Direct SDK approach is clearly better**:

- Simpler to build and maintain
- Better integration with existing Electron architecture
- Full control over features and UX
- Proven by multiple successful projects

Start with the Direct SDK. If you later need to support multiple agents (Gemini CLI, Codex, etc.), you can add an ACP layer on top.
