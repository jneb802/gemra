# Gemra Multi-Agent UI - Implementation Plan

## Architecture Overview

### ACP-Based Multi-Agent System

We're building a process-based multi-agent management system using the Agent Client Protocol (ACP). Each agent runs in its own process, communicating via JSON-RPC over stdio.

```
Electron Main Process
    ├─ AgentPoolManager
    │   ├─ Process spawning/killing
    │   ├─ Health monitoring
    │   └─ Task routing
    │
    ├─ ACPClient (per agent)
    │   ├─ stdio communication
    │   ├─ NDJSON parsing
    │   └─ Message routing
    │
    └─ IPC Bridge
        └─ Main ↔ Renderer

Agent Processes (up to 20)
    ├─ claude-code-acp (Agent 1-N)
    ├─ gemini-cli (Agent N+1)
    └─ codex (Agent N+2)
```

## Project Structure

```
electron/
├── src/
│   ├── main/
│   │   ├── index.ts                      # Entry point (existing)
│   │   ├── WindowManager.ts              # Window management (existing)
│   │   ├── PtyManager.ts                 # PTY management (existing)
│   │   │
│   │   ├── agent/
│   │   │   ├── AgentPoolManager.ts       # NEW: Manages agent pool
│   │   │   ├── ACPClient.ts              # NEW: ACP protocol client
│   │   │   ├── AgentProcess.ts           # NEW: Single agent wrapper
│   │   │   ├── HealthMonitor.ts          # NEW: Monitor agent health
│   │   │   └── TaskQueue.ts              # NEW: Task queue & routing
│   │   │
│   │   ├── ipc/
│   │   │   ├── terminal.ts               # Terminal IPC (existing)
│   │   │   ├── file-browser.ts           # File IPC (existing)
│   │   │   └── agent.ts                  # NEW: Agent IPC handlers
│   │   │
│   │   ├── persistence/
│   │   │   ├── SessionStore.ts           # NEW: SQLite sessions
│   │   │   └── schema.sql                # NEW: DB schema
│   │   │
│   │   └── menu/
│   │       └── MenuBuilder.ts            # Menu (existing)
│   │
│   ├── renderer/
│   │   ├── index.tsx                     # React root (existing)
│   │   ├── App.tsx                       # Main app component
│   │   │
│   │   ├── components/
│   │   │   ├── dashboard/
│   │   │   │   ├── AgentGrid.tsx         # NEW: 4x5 agent grid
│   │   │   │   ├── AgentCard.tsx         # NEW: Single agent card
│   │   │   │   ├── TaskList.tsx          # NEW: Active tasks list
│   │   │   │   └── StatsBar.tsx          # NEW: Pool stats
│   │   │   │
│   │   │   ├── agent/
│   │   │   │   ├── AgentView.tsx         # NEW: Single agent detail
│   │   │   │   ├── ChatInterface.tsx     # NEW: Agent chat
│   │   │   │   ├── MessageList.tsx       # NEW: Message history
│   │   │   │   ├── MessageItem.tsx       # NEW: Single message
│   │   │   │   ├── ToolCallCard.tsx      # NEW: Tool execution UI
│   │   │   │   └── InputBox.tsx          # NEW: User input
│   │   │   │
│   │   │   ├── diff/
│   │   │   │   └── DiffViewer.tsx        # NEW: Code diff display
│   │   │   │
│   │   │   ├── terminal/
│   │   │   │   └── Terminal.tsx          # Terminal (existing)
│   │   │   │
│   │   │   └── layout/
│   │   │       ├── Header.tsx            # Header (existing)
│   │   │       └── Sidebar.tsx           # NEW: Navigation
│   │   │
│   │   └── stores/
│   │       ├── terminalStore.ts          # Terminal state (existing)
│   │       ├── agentPoolStore.ts         # NEW: Pool state
│   │       └── agentStore.ts             # NEW: Individual agent state
│   │
│   └── shared/
│       ├── types.ts                      # Shared types
│       └── acp-types.ts                  # NEW: ACP message types
│
└── package.json
```

## Phase 1: Single Agent Foundation (Week 1)

### Day 1: ACP Protocol Layer

**Goal:** Spawn one agent and communicate via ACP

**1.1 Install dependencies**
```bash
cd electron
npm install @agentclientprotocol/sdk
npm install @zed-industries/claude-code-acp
npm install react-markdown remark-gfm
npm install date-fns
```

**1.2 Define ACP types (shared/acp-types.ts)**
```typescript
// ACP protocol message types
export interface ACPRequest {
  jsonrpc: "2.0";
  id?: string | number;
  method: string;
  params?: any;
}

export interface ACPResponse {
  jsonrpc: "2.0";
  id?: string | number;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

export interface ACPNotification {
  jsonrpc: "2.0";
  method: string;
  params?: any;
}

// ACP Agent messages
export type ACPMessage = ACPRequest | ACPResponse | ACPNotification;

// Prompt turn message (main conversation message)
export interface PromptTurnMessage {
  type: "prompt_turn";
  turn: {
    type: "user" | "assistant";
    content: Array<TextContent | ToolUseContent | ToolResultContent>;
  };
}

export interface TextContent {
  type: "text";
  text: string;
}

export interface ToolUseContent {
  type: "tool_use";
  id: string;
  name: string;
  input: any;
}

export interface ToolResultContent {
  type: "tool_result";
  tool_use_id: string;
  content: string | any[];
  is_error?: boolean;
}

// Agent status
export type AgentStatus = "idle" | "busy" | "error" | "starting" | "stopping";
```

**1.3 Create ACPClient.ts**
```typescript
import { spawn, ChildProcess } from "child_process";
import { EventEmitter } from "events";
import { ACPMessage, ACPResponse } from "../../shared/acp-types";

export interface ACPClientOptions {
  agentCommand: string;          // e.g., "claude-code-acp"
  args?: string[];               // Command line args
  env?: Record<string, string>;  // Environment variables
  workingDirectory?: string;
}

export class ACPClient extends EventEmitter {
  private process?: ChildProcess;
  private messageBuffer = "";
  private requestId = 0;
  private pendingRequests = new Map<string | number, {
    resolve: (value: any) => void;
    reject: (error: any) => void;
  }>();

  constructor(private options: ACPClientOptions) {
    super();
  }

  /**
   * Spawn the agent process
   */
  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.process = spawn(this.options.agentCommand, this.options.args || [], {
        stdio: ["pipe", "pipe", "pipe"],
        env: {
          ...process.env,
          ...this.options.env,
        },
        cwd: this.options.workingDirectory,
      });

      // Handle stdout (NDJSON messages)
      this.process.stdout?.on("data", (data: Buffer) => {
        this.handleStdout(data);
      });

      // Handle stderr (errors)
      this.process.stderr?.on("data", (data: Buffer) => {
        this.emit("error", new Error(data.toString()));
      });

      // Handle process exit
      this.process.on("exit", (code, signal) => {
        this.emit("exit", { code, signal });
      });

      // Handle process errors
      this.process.on("error", (error) => {
        reject(error);
      });

      // Resolve when process is spawned
      if (this.process.pid) {
        resolve();
      }
    });
  }

  /**
   * Handle stdout data (NDJSON)
   */
  private handleStdout(data: Buffer): void {
    this.messageBuffer += data.toString();

    // Split by newlines
    const lines = this.messageBuffer.split("\n");

    // Keep the last incomplete line in buffer
    this.messageBuffer = lines.pop() || "";

    // Process each complete line
    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        const message: ACPMessage = JSON.parse(line);
        this.handleMessage(message);
      } catch (error) {
        this.emit("error", new Error(`Failed to parse ACP message: ${line}`));
      }
    }
  }

  /**
   * Handle incoming ACP message
   */
  private handleMessage(message: ACPMessage): void {
    // Check if it's a response to our request
    if ("id" in message && message.id !== undefined) {
      const pending = this.pendingRequests.get(message.id);
      if (pending) {
        this.pendingRequests.delete(message.id);

        if ("error" in message && message.error) {
          pending.reject(new Error(message.error.message));
        } else {
          pending.resolve((message as ACPResponse).result);
        }
        return;
      }
    }

    // Otherwise, it's a notification or unsolicited message
    this.emit("message", message);
  }

  /**
   * Send ACP request and wait for response
   */
  async request(method: string, params?: any): Promise<any> {
    if (!this.process || !this.process.stdin) {
      throw new Error("Agent process not started");
    }

    const id = ++this.requestId;
    const message = {
      jsonrpc: "2.0" as const,
      id,
      method,
      params,
    };

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });

      // Send message as NDJSON
      this.process!.stdin!.write(JSON.stringify(message) + "\n");

      // Timeout after 30 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error("Request timeout"));
        }
      }, 30000);
    });
  }

  /**
   * Send ACP notification (no response expected)
   */
  notify(method: string, params?: any): void {
    if (!this.process || !this.process.stdin) {
      throw new Error("Agent process not started");
    }

    const message = {
      jsonrpc: "2.0" as const,
      method,
      params,
    };

    this.process.stdin.write(JSON.stringify(message) + "\n");
  }

  /**
   * Stop the agent process
   */
  async stop(): Promise<void> {
    if (!this.process) return;

    return new Promise((resolve) => {
      this.process!.on("exit", () => resolve());
      this.process!.kill("SIGTERM");

      // Force kill after 5 seconds
      setTimeout(() => {
        if (this.process && !this.process.killed) {
          this.process.kill("SIGKILL");
        }
      }, 5000);
    });
  }

  /**
   * Get process ID
   */
  getPid(): number | undefined {
    return this.process?.pid;
  }

  /**
   * Check if process is running
   */
  isRunning(): boolean {
    return !!this.process && !this.process.killed;
  }
}
```

**1.4 Create AgentProcess.ts**
```typescript
import { EventEmitter } from "events";
import { ACPClient } from "./ACPClient";
import { AgentStatus } from "../../shared/acp-types";

export interface AgentConfig {
  id: string;
  type: "claude" | "gemini" | "codex";
  command: string;
  apiKey: string;
  workingDirectory: string;
}

export interface AgentMetrics {
  cpuUsage: number;
  memoryUsage: number;
  messageCount: number;
  errorCount: number;
  uptime: number;
}

export class AgentProcess extends EventEmitter {
  private client: ACPClient;
  private status: AgentStatus = "idle";
  private sessionId?: string;
  private startTime?: Date;
  private metrics: AgentMetrics = {
    cpuUsage: 0,
    memoryUsage: 0,
    messageCount: 0,
    errorCount: 0,
    uptime: 0,
  };

  constructor(public config: AgentConfig) {
    super();

    // Create ACP client
    this.client = new ACPClient({
      agentCommand: config.command,
      args: [],
      env: {
        ANTHROPIC_API_KEY: config.apiKey,
        // Add other env vars based on agent type
      },
      workingDirectory: config.workingDirectory,
    });

    // Forward client events
    this.client.on("message", (message) => {
      this.metrics.messageCount++;
      this.emit("message", message);
    });

    this.client.on("error", (error) => {
      this.metrics.errorCount++;
      this.status = "error";
      this.emit("error", error);
    });

    this.client.on("exit", (info) => {
      this.status = "idle";
      this.emit("exit", info);
    });
  }

  /**
   * Start the agent
   */
  async start(): Promise<void> {
    this.status = "starting";
    this.startTime = new Date();

    try {
      await this.client.start();

      // Initialize session
      const result = await this.client.request("agent/initialize", {
        workingDirectory: this.config.workingDirectory,
      });

      this.sessionId = result?.session_id;
      this.status = "idle";
      this.emit("started");
    } catch (error) {
      this.status = "error";
      throw error;
    }
  }

  /**
   * Send prompt to agent
   */
  async sendPrompt(prompt: string): Promise<void> {
    if (this.status !== "idle") {
      throw new Error(`Agent is ${this.status}, cannot send prompt`);
    }

    this.status = "busy";

    try {
      await this.client.request("agent/prompt", {
        prompt,
        session_id: this.sessionId,
      });
    } catch (error) {
      this.status = "error";
      throw error;
    }
  }

  /**
   * Stop the agent
   */
  async stop(): Promise<void> {
    this.status = "stopping";
    await this.client.stop();
    this.status = "idle";
  }

  /**
   * Get agent status
   */
  getStatus(): AgentStatus {
    return this.status;
  }

  /**
   * Get agent metrics
   */
  getMetrics(): AgentMetrics {
    if (this.startTime) {
      this.metrics.uptime = Date.now() - this.startTime.getTime();
    }
    return { ...this.metrics };
  }

  /**
   * Check if agent is available for work
   */
  isAvailable(): boolean {
    return this.status === "idle" && this.client.isRunning();
  }
}
```

### Day 2: Agent Pool Manager

**2.1 Create AgentPoolManager.ts**
```typescript
import { EventEmitter } from "events";
import { AgentProcess, AgentConfig } from "./AgentProcess";

export interface PoolConfig {
  maxAgents: number;
  defaultAgentType: "claude" | "gemini" | "codex";
  workingDirectory: string;
  apiKeys: {
    claude?: string;
    gemini?: string;
    codex?: string;
  };
}

export class AgentPoolManager extends EventEmitter {
  private agents = new Map<string, AgentProcess>();
  private agentIdCounter = 0;

  constructor(private config: PoolConfig) {
    super();
  }

  /**
   * Create and start a new agent
   */
  async createAgent(type?: "claude" | "gemini" | "codex"): Promise<AgentProcess> {
    if (this.agents.size >= this.config.maxAgents) {
      throw new Error(`Agent pool is full (max ${this.config.maxAgents})`);
    }

    const agentType = type || this.config.defaultAgentType;
    const agentId = `agent-${++this.agentIdCounter}`;

    // Get command based on agent type
    const command = this.getAgentCommand(agentType);
    const apiKey = this.getApiKey(agentType);

    if (!apiKey) {
      throw new Error(`No API key configured for ${agentType}`);
    }

    const agentConfig: AgentConfig = {
      id: agentId,
      type: agentType,
      command,
      apiKey,
      workingDirectory: this.config.workingDirectory,
    };

    const agent = new AgentProcess(agentConfig);

    // Handle agent events
    agent.on("message", (message) => {
      this.emit("agent:message", { agentId, message });
    });

    agent.on("error", (error) => {
      this.emit("agent:error", { agentId, error });
    });

    agent.on("exit", (info) => {
      this.agents.delete(agentId);
      this.emit("agent:exit", { agentId, info });
    });

    // Start the agent
    await agent.start();

    this.agents.set(agentId, agent);
    this.emit("agent:created", { agentId, agent });

    return agent;
  }

  /**
   * Get an idle agent (or create one)
   */
  async getIdleAgent(): Promise<AgentProcess> {
    // Find idle agent
    for (const agent of this.agents.values()) {
      if (agent.isAvailable()) {
        return agent;
      }
    }

    // No idle agents, create new one if under limit
    if (this.agents.size < this.config.maxAgents) {
      return await this.createAgent();
    }

    throw new Error("No idle agents available and pool is full");
  }

  /**
   * Get agent by ID
   */
  getAgent(agentId: string): AgentProcess | undefined {
    return this.agents.get(agentId);
  }

  /**
   * Get all agents
   */
  getAllAgents(): AgentProcess[] {
    return Array.from(this.agents.values());
  }

  /**
   * Stop and remove an agent
   */
  async killAgent(agentId: string): Promise<void> {
    const agent = this.agents.get(agentId);
    if (!agent) return;

    await agent.stop();
    this.agents.delete(agentId);
    this.emit("agent:killed", { agentId });
  }

  /**
   * Stop all agents
   */
  async killAll(): Promise<void> {
    const promises = Array.from(this.agents.keys()).map(id => this.killAgent(id));
    await Promise.all(promises);
  }

  /**
   * Get pool statistics
   */
  getPoolStats() {
    const agents = Array.from(this.agents.values());

    return {
      total: agents.length,
      idle: agents.filter(a => a.getStatus() === "idle").length,
      busy: agents.filter(a => a.getStatus() === "busy").length,
      error: agents.filter(a => a.getStatus() === "error").length,
      maxAgents: this.config.maxAgents,
    };
  }

  /**
   * Get agent command based on type
   */
  private getAgentCommand(type: string): string {
    switch (type) {
      case "claude":
        return "claude-code-acp";
      case "gemini":
        return "gemini-cli"; // Placeholder
      case "codex":
        return "codex"; // Placeholder
      default:
        throw new Error(`Unknown agent type: ${type}`);
    }
  }

  /**
   * Get API key for agent type
   */
  private getApiKey(type: string): string | undefined {
    return this.config.apiKeys[type as keyof typeof this.config.apiKeys];
  }
}
```

### Day 3: IPC Bridge & UI Integration

**3.1 Create IPC handlers (ipc/agent.ts)**
```typescript
import { ipcMain, BrowserWindow } from "electron";
import { AgentPoolManager } from "../agent/AgentPoolManager";

let poolManager: AgentPoolManager;

export function setupAgentIpc(mainWindow: BrowserWindow) {
  // Initialize pool manager
  poolManager = new AgentPoolManager({
    maxAgents: 20,
    defaultAgentType: "claude",
    workingDirectory: process.cwd(),
    apiKeys: {
      claude: process.env.ANTHROPIC_API_KEY,
      // Add other API keys as needed
    },
  });

  // Forward pool events to renderer
  poolManager.on("agent:message", ({ agentId, message }) => {
    mainWindow.webContents.send("agent:message", { agentId, message });
  });

  poolManager.on("agent:error", ({ agentId, error }) => {
    mainWindow.webContents.send("agent:error", { agentId, error: error.message });
  });

  poolManager.on("agent:created", ({ agentId }) => {
    mainWindow.webContents.send("agent:created", { agentId });
  });

  poolManager.on("agent:exit", ({ agentId, info }) => {
    mainWindow.webContents.send("agent:exit", { agentId, info });
  });

  // IPC Handlers

  // Create new agent
  ipcMain.handle("agent:create", async (_, type?: string) => {
    try {
      const agent = await poolManager.createAgent(type);
      return { success: true, agentId: agent.config.id };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Send prompt to specific agent
  ipcMain.handle("agent:prompt", async (_, agentId: string, prompt: string) => {
    try {
      const agent = poolManager.getAgent(agentId);
      if (!agent) {
        throw new Error(`Agent ${agentId} not found`);
      }

      await agent.sendPrompt(prompt);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Get idle agent
  ipcMain.handle("agent:get-idle", async () => {
    try {
      const agent = await poolManager.getIdleAgent();
      return { success: true, agentId: agent.config.id };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Kill agent
  ipcMain.handle("agent:kill", async (_, agentId: string) => {
    try {
      await poolManager.killAgent(agentId);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Get pool stats
  ipcMain.handle("agent:pool-stats", () => {
    return poolManager.getPoolStats();
  });

  // Get all agents
  ipcMain.handle("agent:list", () => {
    const agents = poolManager.getAllAgents();
    return agents.map(agent => ({
      id: agent.config.id,
      type: agent.config.type,
      status: agent.getStatus(),
      metrics: agent.getMetrics(),
    }));
  });
}

export function cleanupAgentPool() {
  if (poolManager) {
    return poolManager.killAll();
  }
}
```

**3.2 Update main/index.ts**
```typescript
import { setupAgentIpc, cleanupAgentPool } from './ipc/agent'

const createWindow = () => {
  // ... existing code ...

  setupAgentIpc(mainWindow)
}

// Clean up on quit
app.on('before-quit', async () => {
  if (ptyManager) {
    ptyManager.killAll()
  }
  await cleanupAgentPool()
})
```

**3.3 Update preload API**
```typescript
// preload/index.ts
contextBridge.exposeInMainWorld("electron", {
  // ... existing APIs ...

  // Agent APIs
  createAgent: (type?: string) => ipcRenderer.invoke("agent:create", type),
  sendPrompt: (agentId: string, prompt: string) =>
    ipcRenderer.invoke("agent:prompt", agentId, prompt),
  getIdleAgent: () => ipcRenderer.invoke("agent:get-idle"),
  killAgent: (agentId: string) => ipcRenderer.invoke("agent:kill", agentId),
  getPoolStats: () => ipcRenderer.invoke("agent:pool-stats"),
  listAgents: () => ipcRenderer.invoke("agent:list"),

  // Agent events
  onAgentMessage: (callback: (data: any) => void) => {
    ipcRenderer.on("agent:message", (_, data) => callback(data));
    return () => ipcRenderer.removeAllListeners("agent:message");
  },
  onAgentError: (callback: (data: any) => void) => {
    ipcRenderer.on("agent:error", (_, data) => callback(data));
    return () => ipcRenderer.removeAllListeners("agent:error");
  },
  onAgentCreated: (callback: (data: any) => void) => {
    ipcRenderer.on("agent:created", (_, data) => callback(data));
    return () => ipcRenderer.removeAllListeners("agent:created");
  },
  onAgentExit: (callback: (data: any) => void) => {
    ipcRenderer.on("agent:exit", (_, data) => callback(data));
    return () => ipcRenderer.removeAllListeners("agent:exit");
  },
});
```

## Phase 2: Multi-Agent Dashboard UI (Week 2)

### Day 4-5: Agent Dashboard Components

**4.1 Create Agent Pool Store (stores/agentPoolStore.ts)**
```typescript
import { create } from "zustand";

export interface Agent {
  id: string;
  type: "claude" | "gemini" | "codex";
  status: "idle" | "busy" | "error" | "starting" | "stopping";
  metrics: {
    cpuUsage: number;
    memoryUsage: number;
    messageCount: number;
    errorCount: number;
    uptime: number;
  };
  currentTask?: string;
}

interface AgentPoolState {
  agents: Map<string, Agent>;
  poolStats: {
    total: number;
    idle: number;
    busy: number;
    error: number;
    maxAgents: number;
  };

  addAgent: (agent: Agent) => void;
  updateAgent: (agentId: string, updates: Partial<Agent>) => void;
  removeAgent: (agentId: string) => void;
  setPoolStats: (stats: any) => void;
  refreshAgents: () => Promise<void>;
}

export const useAgentPoolStore = create<AgentPoolState>((set, get) => ({
  agents: new Map(),
  poolStats: {
    total: 0,
    idle: 0,
    busy: 0,
    error: 0,
    maxAgents: 20,
  },

  addAgent: (agent) =>
    set((state) => {
      const agents = new Map(state.agents);
      agents.set(agent.id, agent);
      return { agents };
    }),

  updateAgent: (agentId, updates) =>
    set((state) => {
      const agents = new Map(state.agents);
      const agent = agents.get(agentId);
      if (agent) {
        agents.set(agentId, { ...agent, ...updates });
      }
      return { agents };
    }),

  removeAgent: (agentId) =>
    set((state) => {
      const agents = new Map(state.agents);
      agents.delete(agentId);
      return { agents };
    }),

  setPoolStats: (stats) => set({ poolStats: stats }),

  refreshAgents: async () => {
    const agentList = await window.electron.listAgents();
    const agents = new Map<string, Agent>();

    agentList.forEach((agent: Agent) => {
      agents.set(agent.id, agent);
    });

    const stats = await window.electron.getPoolStats();

    set({ agents, poolStats: stats });
  },
}));
```

**4.2 Create AgentGrid.tsx**
```typescript
import React, { useEffect } from "react";
import { useAgentPoolStore } from "../../stores/agentPoolStore";
import { AgentCard } from "./AgentCard";

export const AgentGrid: React.FC = () => {
  const { agents, refreshAgents } = useAgentPoolStore();

  useEffect(() => {
    // Initial load
    refreshAgents();

    // Refresh every 2 seconds
    const interval = setInterval(refreshAgents, 2000);
    return () => clearInterval(interval);
  }, []);

  const agentArray = Array.from(agents.values());

  return (
    <div className="agent-grid">
      {agentArray.map((agent) => (
        <AgentCard key={agent.id} agent={agent} />
      ))}

      {/* Empty slots */}
      {Array.from({ length: 20 - agentArray.length }).map((_, i) => (
        <div key={`empty-${i}`} className="agent-card empty">
          <button onClick={() => window.electron.createAgent()}>
            + Create Agent
          </button>
        </div>
      ))}
    </div>
  );
};
```

**4.3 Create AgentCard.tsx**
```typescript
import React from "react";
import { Agent } from "../../stores/agentPoolStore";

interface AgentCardProps {
  agent: Agent;
}

export const AgentCard: React.FC<AgentCardProps> = ({ agent }) => {
  const getStatusColor = () => {
    switch (agent.status) {
      case "idle": return "green";
      case "busy": return "blue";
      case "error": return "red";
      default: return "gray";
    }
  };

  return (
    <div className={`agent-card status-${agent.status}`}>
      <div className="agent-header">
        <span className="agent-id">{agent.id}</span>
        <span className="agent-type">{agent.type}</span>
      </div>

      <div className="agent-status">
        <div className={`status-dot ${getStatusColor()}`} />
        <span>{agent.status.toUpperCase()}</span>
      </div>

      {agent.status === "busy" && (
        <div className="agent-progress">
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{ width: `${agent.metrics.cpuUsage}%` }}
            />
          </div>
          <span>{agent.metrics.cpuUsage}%</span>
        </div>
      )}

      {agent.currentTask && (
        <div className="current-task">
          {agent.currentTask}
        </div>
      )}

      <div className="agent-actions">
        <button onClick={() => {/* Navigate to agent detail */}}>
          View
        </button>
        <button onClick={() => window.electron.killAgent(agent.id)}>
          Kill
        </button>
      </div>
    </div>
  );
};
```

### Days 6-7: Agent Detail View & Chat Interface

*(Similar structure to original IMPLEMENTATION.md but adapted for multi-agent context)*

## Phase 3: Advanced Features (Weeks 3-4)

- Task routing and queue system
- Health monitoring and auto-recovery
- Session persistence
- Terminal integration per agent
- Diff viewer and code review
- Analytics and cost tracking

## Development Workflow

### Prerequisites

1. **Install claude-code-acp**
```bash
npm install -g @zed-industries/claude-code-acp
```

2. **Set environment variables**
```bash
export ANTHROPIC_API_KEY=your_key_here
```

### Start Development

```bash
cd electron
npm install
npm run dev
```

### Testing Strategy

1. **Single agent test**: Start one agent, send prompt, verify response
2. **Multi-agent test**: Start 5 agents, send prompts to each
3. **Load test**: Start 20 agents, monitor memory/CPU
4. **Crash recovery**: Kill agent process, verify auto-restart
5. **Protocol test**: Verify NDJSON parsing with malformed messages

## Key Technical Decisions

### Why Process-Based Architecture?
- **Isolation**: One crash doesn't affect others
- **Scalability**: OS handles resource management
- **Simplicity**: Standard process spawning
- **Monitoring**: Easy to track per-process metrics

### Why NDJSON?
- **Streaming**: Parse messages as they arrive
- **Simple**: No complex framing protocol
- **Standard**: Works with any language/tool
- **Debuggable**: Can pipe to file for inspection

### Why JSON-RPC 2.0?
- **Standard**: Well-defined protocol
- **Request/response**: Easy to track conversations
- **Notifications**: One-way messages when needed
- **Error handling**: Built-in error format

## Success Criteria

**Phase 1 Complete:**
- [x] Spawn single agent process
- [x] Bidirectional JSON-RPC communication
- [x] Message streaming working
- [x] Basic error handling

**Phase 2 Complete:**
- [ ] Spawn 20 concurrent agents
- [ ] Dashboard showing all agents
- [ ] Task routing to idle agents
- [ ] Health monitoring working

**Phase 3 Complete:**
- [ ] All advanced features implemented
- [ ] Production-ready error handling
- [ ] Performance optimized
- [ ] Documentation complete

## Resources

- [ACP Protocol Spec](https://agentclientprotocol.com)
- [ACP TypeScript SDK](https://github.com/agentclientprotocol/agent-client-protocol)
- [Zed's claude-code-acp](https://github.com/zed-industries/claude-code-acp)
- [JSON-RPC 2.0 Spec](https://www.jsonrpc.org/specification)
