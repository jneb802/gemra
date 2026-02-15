# Gemra Code Review - February 14, 2026

## Executive Summary

You're building a multi-agent orchestration UI for Claude Code using the Agent Client Protocol (ACP). The foundation is solid, but there are **7 critical bugs** that will prevent the app from working, plus several architectural issues that need addressing.

**Current State:** ✅ Builds successfully, but won't function due to missing dependencies and critical bugs.

---

## 🔴 Critical Bugs (Must Fix)

### 1. **Missing Required Dependencies**
**Location:** `electron/package.json`
**Severity:** CRITICAL - App cannot function

```bash
# Required packages are not installed:
- @agentclientprotocol/sdk
- @zed-industries/claude-code-acp (or claude-code-acp binary)
- react-markdown + remark-gfm (for message rendering)
```

**Impact:** The `claude-code-acp` command will fail with "command not found" when spawning agents.

**Fix:**
```bash
cd electron
npm install @agentclientprotocol/sdk react-markdown remark-gfm
```

**Note:** You may need to install `claude-code-acp` globally or via npm if it's available, or use the Claude Agent SDK directly as recommended in `ACP_RESEARCH.md`.

---

### 2. **Memory Leak: Agents Not Cleaned Up on Tab Close**
**Location:** `electron/src/renderer/stores/tabStore.ts:76-100`
**Severity:** CRITICAL - Resource leak

When a user closes a Claude chat tab, the agent process continues running in the background.

**Current Code:**
```typescript
closeTab: (id: string) => {
  const state = get()
  const tabIndex = state.tabs.findIndex((tab) => tab.id === id)

  if (tabIndex === -1) return

  const newTabs = state.tabs.filter((tab) => tab.id !== id)
  // ❌ Missing: Stop the agent process!
  // ...
}
```

**Fix:**
```typescript
closeTab: async (id: string) => {
  const state = get()
  const tab = state.tabs.find((t) => t.id === id)

  // Stop Claude agent if it's a claude-chat tab
  if (tab?.type === 'claude-chat' && tab.agentId) {
    try {
      await window.electron.claude.stop(tab.agentId)
    } catch (error) {
      console.error('Failed to stop agent:', error)
    }
  }

  // ... rest of closeTab logic
}
```

**Also update App.tsx** to handle async closeTab calls.

---

### 3. **Hardcoded Working Directory**
**Location:** `electron/src/renderer/App.tsx:23`
**Severity:** HIGH - Won't work for other users

```typescript
const workingDir = '/Users/benjmarston/Develop/gemra' // ❌ Hardcoded!
```

**Impact:** App will fail for any user without this exact directory structure.

**Fix:**
```typescript
const handleNewClaudeTab = useCallback(async () => {
  // Use current directory or prompt user
  const workingDir = process.cwd() // or show a directory picker
  const result = await window.electron.claude.start(workingDir)
  // ...
}, [createClaudeTab])
```

**Better Solution:** Add a directory picker UI or default to user's home directory.

---

### 4. **Duplicate Event Handler in Main Process**
**Location:** `electron/src/main/index.ts:43 and 64`
**Severity:** MEDIUM - Causes duplicate behavior

```typescript
// Line 43
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

// Line 64 - DUPLICATE!
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})
```

**Fix:** Remove one of them (lines 64-68).

---

### 5. **API Key Not Validated Before Agent Spawn**
**Location:** `electron/src/main/ipc/claude.ts:16-18`
**Severity:** MEDIUM - Poor error UX

```typescript
const apiKey = process.env.ANTHROPIC_API_KEY
if (!apiKey) {
  throw new Error('ANTHROPIC_API_KEY environment variable not set')
}
```

This error happens AFTER the user clicks "New Claude Tab", which is confusing.

**Fix:** Validate on app startup and show a clear setup dialog if missing:
```typescript
// In main/index.ts
app.whenReady().then(() => {
  if (!process.env.ANTHROPIC_API_KEY) {
    // Show modal prompting user to set API key
    dialog.showErrorBox(
      'API Key Required',
      'Please set ANTHROPIC_API_KEY environment variable and restart the app.'
    )
    app.quit()
  }
  createWindow()
})
```

---

### 6. **ACPClient Resolves Before Agent is Ready**
**Location:** `electron/src/main/agent/ACPClient.ts:63-68`
**Severity:** HIGH - Race condition

```typescript
// Resolve when process is spawned
if (this.process.pid) {
  console.log(`[ACPClient] Started with PID ${this.process.pid}`)
  resolve()  // ❌ Too early! Agent may not be ready yet
}
```

**Impact:** Messages sent immediately after `start()` may be lost.

**Fix:** Wait for the agent to send a ready notification or initial message:
```typescript
async start(): Promise<void> {
  return new Promise((resolve, reject) => {
    // ... spawn process ...

    // Wait for agent ready signal
    const readyHandler = (message: ACPMessage) => {
      if (message.method === 'agent/ready') {
        this.off('message', readyHandler)
        resolve()
      }
    }
    this.on('message', readyHandler)

    // Timeout after 10 seconds
    setTimeout(() => {
      this.off('message', readyHandler)
      reject(new Error('Agent startup timeout'))
    }, 10000)
  })
}
```

---

### 7. **No Markdown Rendering for Messages**
**Location:** `electron/src/renderer/components/claude/MessageList.tsx:38`
**Severity:** MEDIUM - Poor UX

```typescript
<div className="message-content">
  {message.content}  {/* ❌ Renders raw markdown as plain text */}
</div>
```

Claude sends markdown-formatted responses with code blocks, but they're shown as raw text.

**Fix:**
```typescript
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

<div className="message-content">
  <ReactMarkdown remarkPlugins={[remarkGfm]}>
    {message.content}
  </ReactMarkdown>
</div>
```

---

## ⚠️ Major Issues (Should Fix Soon)

### 8. **Incomplete ACP Message Parsing**
**Location:** `electron/src/main/agent/ClaudeAgent.ts:62-104`

The `handleMessage()` method assumes specific message formats that may not match the actual ACP protocol:

```typescript
if (message.method === 'agent/update') {  // ❌ Is this the right method name?
  const content = message.params?.content
  // ...
}
```

**Problem:** Without the actual ACP spec or testing with real `claude-code-acp`, these assumptions may be wrong.

**Recommendation:**
1. Log ALL incoming messages to understand the actual protocol
2. Reference the official ACP spec: https://agentclientprotocol.com
3. Or switch to using Claude Agent SDK directly (simpler, as noted in ACP_RESEARCH.md)

---

### 9. **No Streaming Support**
**Location:** `electron/src/renderer/components/claude/ClaudeChat.tsx:24-48`

Messages are appended in chunks, but they don't stream character-by-character like ChatGPT.

**Current behavior:** Text appears in large chunks
**Expected behavior:** Smooth streaming character-by-character

**Fix:** Accumulate text in a buffer and render progressively.

---

### 10. **No Tool Call Visualization**
**Location:** Missing feature

Claude Code uses tools (Read, Edit, Bash, etc.) extensively, but there's no UI to show:
- What tool is being called
- Tool inputs/outputs
- Success/failure status

**Example Tool Call Message (from Claude API):**
```json
{
  "type": "tool_use",
  "id": "toolu_123",
  "name": "Read",
  "input": { "file_path": "/path/to/file.ts" }
}
```

**Recommendation:** Create a `ToolCallCard` component (already planned in IMPLEMENTATION.md) to show:
```
[Read] /path/to/file.ts
✓ Completed in 234ms
```

---

### 11. **No Error Boundaries in React**
**Location:** All React components

If any component crashes, it will crash the entire app.

**Fix:** Add error boundary wrapper:
```typescript
// components/ErrorBoundary.tsx
export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error, errorInfo) {
    console.error('React error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return <div>Something went wrong. Please restart the app.</div>
    }
    return this.props.children
  }
}

// Wrap App.tsx:
<ErrorBoundary>
  <App />
</ErrorBoundary>
```

---

### 12. **Orphaned Agents on App Exit**
**Location:** `electron/src/main/index.ts:56-61`

```typescript
app.on('before-quit', async () => {
  if (ptyManager) {
    ptyManager.killAll()
  }
  await cleanupClaudeAgents()  // ✅ Good!
})
```

**Issue:** If the app crashes or is force-killed, agents keep running.

**Fix:** Track agent PIDs in a file and clean them up on next startup:
```typescript
// On agent spawn:
fs.appendFileSync('/tmp/gemra-agents.pid', `${agent.pid}\n`)

// On app startup:
const pids = fs.readFileSync('/tmp/gemra-agents.pid', 'utf-8')
  .split('\n')
  .filter(Boolean)
pids.forEach(pid => {
  try { process.kill(Number(pid), 'SIGTERM') } catch {}
})
fs.unlinkSync('/tmp/gemra-agents.pid')
```

---

## 🔵 Architectural Concerns

### 13. **ACP vs. Direct SDK Contradiction**
**Issue:** Code uses ACP (spawning external `claude-code-acp` process), but `ACP_RESEARCH.md` recommends using Claude Agent SDK directly.

**Current:** Electron → `claude-code-acp` process → Claude API
**Recommended:** Electron → `@anthropic-ai/claude-agent-sdk` → Claude API

**Pros of Direct SDK:**
- Simpler (no process spawning)
- Better error messages
- Easier debugging
- Proven by CodePilot project
- Tighter integration

**Pros of ACP:**
- Can swap agents (Claude, Gemini, Codex)
- Process isolation
- Future-proof protocol

**Decision needed:** Pick one approach and commit to it. For MVP, Direct SDK is faster.

---

### 14. **No Agent Pool Manager Yet**
**Scope:** `SCOPE.md` calls for managing 20 concurrent agents
**Current:** Only single agent support

This is fine for Phase 1, but the architecture should be designed with multi-agent in mind:

```typescript
// Future-proof design:
interface AgentPoolManager {
  spawn(count: number): Promise<Agent[]>
  getIdleAgent(): Agent | null
  assign(task: Task): Promise<void>
  health(): AgentHealth[]
}
```

---

### 15. **No Session Persistence**
**Impact:** All conversations lost on app restart

Recommended: Add SQLite storage for:
- Agent conversations
- Tool call history
- File changes per agent

```bash
npm install better-sqlite3
```

---

## 🟢 Code Quality Issues

### 16. **Excessive Use of `any` Type**
**Examples:**
- `claude.ts:57` - `agent.on('exit', (info: any) => ...)`
- `types.ts:69` - `params?: any`

**Fix:** Define proper types for all data structures.

---

### 17. **Inconsistent Error Handling**
Some places throw, some log, some return error objects.

**Recommendation:** Standardize on one pattern:
```typescript
type Result<T> =
  | { success: true; data: T }
  | { success: false; error: string }
```

---

### 18. **No Type Guards for Message Validation**
When parsing JSON-RPC messages, there's no validation that messages match expected structure.

**Example:**
```typescript
function isACPMessage(obj: unknown): obj is ACPMessage {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'jsonrpc' in obj &&
    obj.jsonrpc === '2.0'
  )
}
```

---

### 19. **CSS is Missing**
Components reference CSS classes (`.claude-chat`, `.message-list`, etc.) but no CSS files exist.

**Check:** Search for `*.css` files in `electron/src/renderer/` → None found

**Fix:** Create CSS modules or styled-components.

---

### 20. **No Tests**
Zero test files in the entire project.

**Recommendation:** Add tests for at least critical paths:
- ACP message parsing
- Agent lifecycle
- IPC handlers

---

## 📋 Quick Fix Priority List

**Do First (Blockers):**
1. ✅ Install missing dependencies
2. ✅ Fix hardcoded directory
3. ✅ Add agent cleanup on tab close
4. ✅ Remove duplicate activate handler
5. ✅ Validate API key on startup

**Do Soon (Major Issues):**
6. Add markdown rendering
7. Fix ACPClient race condition
8. Add tool call visualization
9. Add error boundaries
10. Test with real claude-code-acp or switch to Direct SDK

**Do Eventually (Polish):**
11. Add session persistence
12. Improve error handling consistency
13. Add TypeScript type guards
14. Create CSS for components
15. Add tests

---

## 🚀 Next Steps

### Immediate Actions:
```bash
cd electron

# 1. Install dependencies
npm install react-markdown remark-gfm

# 2. Test if claude-code-acp is available
which claude-code-acp

# 3. If not found, consider switching to Claude Agent SDK:
npm install @anthropic-ai/claude-agent-sdk
```

### Testing Checklist:
- [ ] Can spawn a Claude agent
- [ ] Can send messages to agent
- [ ] Agent responses appear in UI
- [ ] Markdown renders correctly
- [ ] Agent stops when tab closes
- [ ] App handles missing API key gracefully
- [ ] Works on other machines (not just your dev machine)

---

## 📚 References

- **ACP Spec:** https://agentclientprotocol.com
- **Claude Agent SDK:** https://platform.claude.com/docs/en/api/agent-sdk
- **Similar Project (CodePilot):** https://github.com/op7418/CodePilot
- **Your Research:** `ACP_RESEARCH.md`, `SCOPE.md`, `IMPLEMENTATION.md`

---

## 💡 Final Recommendation

Based on your research document and the current state:

**Option A (Faster MVP):** Switch to Claude Agent SDK directly
- Remove ACPClient.ts and ClaudeAgent.ts
- Use `@anthropic-ai/claude-agent-sdk` directly in main process
- Simpler architecture, fewer bugs, faster to build
- Can always add ACP layer later for multi-agent support

**Option B (Stay with ACP):** Fix the ACP implementation
- Install or build `claude-code-acp`
- Fix all critical bugs listed above
- Test thoroughly with real agent
- More complex but future-proof

**My vote:** Option A for Phase 1 MVP, then add ACP in Phase 2 when you scale to 20 agents.

---

## ✅ Good Things!

Despite the issues, you've done several things very well:

1. **Clean Architecture:** Good separation of main/renderer/shared
2. **TypeScript:** Proper typing structure in place
3. **IPC Design:** Clean IPC handlers with proper error handling patterns
4. **Documentation:** Excellent SCOPE.md and IMPLEMENTATION.md planning
5. **Zustand State:** Clean state management setup
6. **Existing Terminal:** Working xterm.js foundation is solid

Keep building! The foundation is strong, just needs these fixes to function.
