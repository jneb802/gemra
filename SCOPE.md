# Gemra: Multi-Agent Claude Code UI - Project Scope

## Vision

Build a native desktop UI for managing up to 20 concurrent AI coding agents (Claude Code, Gemini CLI, Codex, etc.) via the Agent Client Protocol (ACP). Provide superior workflow management, visualization, and orchestration compared to running multiple CLI instances.

## Core Value Proposition

**Problem:** Running multiple Claude Code CLI instances is unwieldy
- No visual overview of what each agent is doing
- Hard to manage 20 terminal windows
- Can't easily compare or coordinate agents
- No unified task routing or agent allocation

**Solution:** Gemra provides a mission control center for AI agents
- Visual dashboard showing all active agents
- Intelligent task routing and agent allocation
- Real-time monitoring of agent health and progress
- Unified interface for Claude Code, Gemini CLI, Codex, and more
- Integrated terminal emulator for each agent's output

## Current State

- **Electron + React + xterm.js** terminal emulator
- Multiple tabs, file browser, split panes
- WebGL-accelerated rendering
- Solid foundation to build upon

## Architecture: ACP-First Multi-Agent System

### Why ACP?

**Process Isolation:**
- Each agent runs in its own process
- One agent crash doesn't affect others
- OS-level resource management (CPU, memory)
- Easy to spawn/kill/restart individual agents

**Multi-Agent Support:**
- One protocol, any ACP-compatible agent
- Claude Code, Gemini CLI, Codex, Cline, etc.
- Swap agent types at runtime
- Compare different agents on same task

**Scalability:**
- Handle 20+ concurrent agents efficiently
- Process-based parallelism
- Built-in lifecycle management

### System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Gemra UI (Electron)                     │
│  ┌───────────────────────────────────────────────────────┐  │
│  │            Agent Pool Manager (Main Process)          │  │
│  │  - Process spawning & lifecycle                       │  │
│  │  - Health monitoring & auto-recovery                  │  │
│  │  - Task routing & agent allocation                    │  │
│  │  - ACP JSON-RPC communication                         │  │
│  └───────────────────────────────────────────────────────┘  │
│         ↓ stdio (NDJSON)     ↓ stdio     ↓ stdio           │
│    ┌──────────┐         ┌──────────┐    ┌──────────┐       │
│    │  Agent 1 │         │  Agent 2 │    │  Agent N │       │
│    │  Claude  │         │  Gemini  │    │  Claude  │       │
│    │  (busy)  │         │  (idle)  │    │  (busy)  │       │
│    └──────────┘         └──────────┘    └──────────┘       │
│         ↓                    ↓               ↓              │
│    ┌────────────────────────────────────────────────┐       │
│    │         Anthropic / Google / Other APIs        │       │
│    └────────────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────────────┘
```

## Core Features

### Phase 1: Single Agent Foundation (Week 1)

**1.1 ACP Agent Manager**
- [ ] Spawn ACP agent processes (`claude-code-acp`, etc.)
- [ ] JSON-RPC over stdio communication
- [ ] Message parsing and routing
- [ ] Process lifecycle management
- [ ] Error handling and recovery

**1.2 Basic Chat Interface**
- [ ] Single agent conversation view
- [ ] Streaming message display
- [ ] Markdown rendering with syntax highlighting
- [ ] Tool call visualization
- [ ] User input with send button

**1.3 Agent Selection**
- [ ] Choose agent type (Claude, Gemini, etc.)
- [ ] Configure agent options (working directory, tools)
- [ ] API key management
- [ ] Save agent configurations

### Phase 2: Multi-Agent Pool Management (Week 2)

**2.1 Agent Pool Manager**
- [ ] Spawn up to 20 concurrent agents
- [ ] Agent pool configuration (size, types)
- [ ] Health monitoring (CPU, memory, status)
- [ ] Auto-restart crashed agents
- [ ] Graceful shutdown and cleanup

**2.2 Agent Dashboard**
- [ ] Visual grid showing all active agents
- [ ] Per-agent status (idle/busy/error)
- [ ] Resource usage indicators
- [ ] Click to focus/view agent
- [ ] Color-coded agent types

**2.3 Task Routing**
- [ ] "Get idle agent" allocation
- [ ] Assign task to specific agent
- [ ] Queue tasks when all agents busy
- [ ] Load balancing strategies
- [ ] Priority queue support

### Phase 3: Advanced Workflows (Week 3)

**3.1 Multi-Agent Orchestration**
- [ ] Parallel task execution (20 agents, 20 tasks)
- [ ] Agent specialization (testing, coding, docs)
- [ ] Task dependencies and sequencing
- [ ] Agent groups/teams
- [ ] Broadcast task to all agents

**3.2 Enhanced Visualization**
- [ ] Side-by-side agent comparison
- [ ] Aggregate progress view
- [ ] Task timeline/Gantt chart
- [ ] Agent conversation history
- [ ] File change tracking across agents

**3.3 Terminal Integration**
- [ ] Per-agent terminal instance
- [ ] Terminal multiplexing (20 terminals)
- [ ] Bash command approval per agent
- [ ] Stream terminal output to agents
- [ ] Terminal history per agent

### Phase 4: Production Features (Week 4+)

**4.1 Session Management**
- [ ] Persist agent sessions (SQLite)
- [ ] Resume individual agents
- [ ] Session templates
- [ ] Export/import sessions
- [ ] Session replay

**4.2 Diff & Code Review**
- [ ] Visual diff viewer per agent
- [ ] Aggregate diff view (all agents)
- [ ] Approve/reject changes per agent
- [ ] Code review workflows
- [ ] Conflict resolution UI

**4.3 Monitoring & Analytics**
- [ ] Per-agent cost tracking
- [ ] API usage dashboard
- [ ] Performance metrics
- [ ] Success/failure rates
- [ ] Export analytics data

**4.4 Collaboration Features**
- [ ] Share agent sessions
- [ ] Team agent pools
- [ ] Agent marketplace (share configs)
- [ ] Collaborative debugging
- [ ] Screen sharing per agent

## UI Layout Concept

### Dashboard View (Default)

```
┌─────────────────────────────────────────────────────────────────┐
│  Gemra - Agent Control Center                        [- □ ×]   │
├─────────────────────────────────────────────────────────────────┤
│  [New Task ▼] [Agent Pool: 12/20] [Total Cost: $2.47]         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Agent Grid (4x5 = 20 agents)                                  │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐                │
│  │ A1   │ │ A2   │ │ A3   │ │ A4   │ │ A5   │                │
│  │Claude│ │Claude│ │Gemini│ │Claude│ │IDLE  │                │
│  │BUSY  │ │BUSY  │ │BUSY  │ │ERROR │ │      │                │
│  │ 87%  │ │ 43%  │ │ 92%  │ │ --   │ │ --   │                │
│  └──────┘ └──────┘ └──────┘ └──────┘ └──────┘                │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐                │
│  │ A6   │ │ A7   │ │ A8   │ │ A9   │ │ A10  │                │
│  │Claude│ │IDLE  │ │Claude│ │IDLE  │ │IDLE  │                │
│  │BUSY  │ │      │ │BUSY  │ │      │ │      │                │
│  │ 24%  │ │ --   │ │ 56%  │ │ --   │ │ --   │                │
│  └──────┘ └──────┘ └──────┘ └──────┘ └──────┘                │
│  ... (remaining 10 agent slots)                                │
│                                                                 │
│  Active Tasks                                                   │
│  • Agent A1: "Refactor auth module"                            │
│  • Agent A2: "Fix login bug in frontend"                       │
│  • Agent A3: "Write integration tests"                         │
│  • Agent A8: "Update API documentation"                        │
│                                                                 │
│  [Task Queue: 3 pending]                                       │
└─────────────────────────────────────────────────────────────────┘
```

### Agent Detail View (Click on agent)

```
┌─────────────────────────────────────────────────────────────────┐
│  ← Back to Dashboard          Agent A1 (Claude Code)           │
├─────────────────────────────────────────────────────────────────┤
│  Status: BUSY │ CPU: 87% │ Memory: 2.3GB │ Cost: $0.42        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Conversation                                                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ You: Refactor the auth module to use JWT                │   │
│  │                                                           │   │
│  │ Agent A1: I'll help refactor the auth module...          │   │
│  │                                                           │   │
│  │ [Tool Call: Read] src/auth/index.ts                      │   │
│  │ ✓ Completed in 234ms                                     │   │
│  │                                                           │   │
│  │ [Tool Call: Edit] src/auth/index.ts                      │   │
│  │ - old code using sessions                                │   │
│  │ + new code using JWT                                     │   │
│  │ [Approve] [Reject] [View Full Diff]                      │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Type message for Agent A1...                [Send]      │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│  [Terminal] [Files Changed: 3] [History] [Kill Agent]         │
│                                                                 │
│  $ npm test                                                     │
│  > jest                                                         │
│  ✓ auth.test.ts (3 tests)                                      │
└─────────────────────────────────────────────────────────────────┘
```

### Parallel Task View

```
┌─────────────────────────────────────────────────────────────────┐
│  Parallel Task: "Refactor entire codebase"                     │
├─────────────────────────────────────────────────────────────────┤
│  [▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░] 60% Complete (12/20 agents done)      │
│                                                                 │
│  ✓ Agent A1: /src/auth   → DONE (3 files changed)             │
│  ✓ Agent A2: /src/api    → DONE (5 files changed)             │
│  ✓ Agent A3: /src/db     → DONE (2 files changed)             │
│  ⚙ Agent A4: /src/ui     → IN PROGRESS (43% done)             │
│  ⚙ Agent A5: /src/hooks  → IN PROGRESS (78% done)             │
│  ⏸ Agent A6: /src/utils  → QUEUED                             │
│  ⏸ Agent A7: /src/types  → QUEUED                             │
│  ... (remaining agents)                                        │
│                                                                 │
│  [View All Diffs] [Approve All] [Reject All] [Stop All]       │
└─────────────────────────────────────────────────────────────────┘
```

## Technical Stack

**Core (Existing):**
- Electron 32.x
- React 18.x + TypeScript
- xterm.js + WebGL
- node-pty
- Zustand (state management)

**New Dependencies:**
- `@zed-industries/claude-code-acp` (ACP adapter for Claude)
- `@agentclientprotocol/sdk` (ACP TypeScript SDK)
- `react-markdown` + `remark-gfm` (Markdown rendering)
- `diff` + `react-diff-view` (Diff visualization)
- `better-sqlite3` (Session persistence)
- `recharts` (Analytics charts)
- `monaco-editor` or `codemirror` (Code editing)

## Key Differentiators

### vs. Multiple CLI Windows
- ✅ Unified dashboard showing all agents
- ✅ One-click task distribution
- ✅ Aggregate progress tracking
- ✅ Centralized monitoring and control

### vs. Single Claude Code Instance
- ✅ 20x parallelism (20 agents vs 1)
- ✅ Task specialization (testing, coding, docs)
- ✅ Compare different agent types
- ✅ Fault tolerance (one crash doesn't stop others)

### vs. Zed/IDEs with ACP
- ✅ Purpose-built for agent orchestration
- ✅ Not tied to code editing workflow
- ✅ Advanced multi-agent features
- ✅ Standalone agent management tool

## Use Cases

**1. Large Codebase Refactoring**
- Assign 20 agents to 20 different modules
- Parallel refactoring with unified review
- 20x faster than sequential approach

**2. Comprehensive Testing**
- 10 agents writing unit tests
- 5 agents writing integration tests
- 5 agents writing documentation
- All running simultaneously

**3. Multi-Project Management**
- Each agent working on different project
- Switch context between projects
- Manage multiple clients/codebases

**4. Agent Comparison**
- Run Claude and Gemini on same task
- Compare quality, speed, cost
- Choose best agent for each task type

**5. Team Collaboration**
- Each team member gets dedicated agents
- Share agent pool across team
- Collaborative debugging sessions

## Success Criteria

**MVP (Phase 1 Complete):**
- [x] Spawn single ACP agent (claude-code-acp)
- [x] Bidirectional communication via JSON-RPC
- [x] Chat interface with streaming
- [x] Tool call visualization
- [x] Basic error handling

**Multi-Agent (Phase 2 Complete):**
- [ ] Spawn and manage 20+ concurrent agents
- [ ] Agent dashboard with real-time status
- [ ] Task routing and allocation
- [ ] Health monitoring and recovery
- [ ] Support multiple agent types

**Production Ready:**
- [ ] Session persistence
- [ ] Advanced orchestration
- [ ] Monitoring and analytics
- [ ] Polish and performance
- [ ] Documentation and onboarding

## Development Timeline

- **Week 1:** Single agent foundation
- **Week 2:** Multi-agent pool management
- **Week 3:** Advanced workflows and orchestration
- **Week 4+:** Polish, analytics, collaboration features

## Resources

- [Agent Client Protocol Spec](https://agentclientprotocol.com)
- [ACP TypeScript SDK](https://github.com/agentclientprotocol/agent-client-protocol)
- [Zed's claude-code-acp](https://github.com/zed-industries/claude-code-acp)
- [Claude Agent SDK](https://platform.claude.com/docs/en/api/agent-sdk/overview)
- [Zed's ACP Integration](https://zed.dev/docs/ai/external-agents)
