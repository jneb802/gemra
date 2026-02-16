# Docker Implementation Analysis for Gemra Claude Chat

**Date:** 2026-02-15
**Goal:** Enable container toggle button to run Claude agent in Docker

---

## Executive Summary

The Claude Agent SDK provides a `spawnClaudeCodeProcess` hook that allows complete control over how the Claude CLI is spawned. This means **Option A (subprocess with docker run)** is the most viable approach, as it's officially supported by the SDK architecture.

---

## Option A: Docker Subprocess Mode ⭐ RECOMMENDED

### How It Works

Instead of spawning `node /path/to/cli.js` directly, we wrap it in `docker run`:

```typescript
// Without Docker (current):
spawn('node', ['/path/to/cli.js', '--args'])

// With Docker (proposed):
spawn('docker', [
  'run',
  '-i',                                    // Interactive stdin/stdout
  '--rm',                                  // Auto-remove on exit
  '-v', '/host/workdir:/workspace',       // Mount working directory
  '-w', '/workspace',                      // Set working directory
  '-v', '/path/to/cli.js:/cli.js:ro',    // Mount CLI (read-only)
  '-e', 'ENV_VAR=value',                   // Environment variables
  '--network', 'host',                     // Network access
  'gemra-claude:latest',                   // Our Docker image
  'node', '/cli.js', '--args'             // Command to run
])
```

### SDK Integration Point

In `ACPClient.ts`, modify the `start()` method:

```typescript
this.session = sdk.unstable_v2_createSession({
  model: 'claude-sonnet-4-5-20250929',
  pathToClaudeCodeExecutable: cliPath,
  workingDirectory: this.options.workingDirectory,
  env: { ...process.env, ...this.options.customEnv },

  // Add custom spawn function when Docker is enabled
  ...(this.options.dockerOptions?.enabled && {
    spawnClaudeCodeProcess: (options: SpawnOptions) => {
      return this.spawnDockerProcess(options, cliPath);
    }
  })
});
```

### Advantages ✅

- **Officially supported** - SDK designed for this use case
- **Simple stdio communication** - Works exactly like local mode
- **Full isolation** - Agent runs in container
- **No SDK modifications** - Pure integration layer
- **Node ChildProcess compatible** - Return value already satisfies `SpawnedProcess` interface

### Challenges ⚠️

1. **Volume Mounting**
   - Must mount working directory: `-v /Users/benjmarston/Develop/gemra:/workspace`
   - Must mount CLI executable (or include in image)
   - Permissions: Container runs as `node` user, host is `benjmarston`

2. **Image Building**
   - First run needs `docker build` (can take 2-5 minutes)
   - Need to handle build progress/errors
   - Cache between runs using named image

3. **Environment Variables**
   - API keys need to pass through: `-e ANTHROPIC_API_KEY=...`
   - Git config (name/email) for commits
   - SSH keys for git operations (complicated)

4. **File Permissions**
   - Docker user UID != host user UID
   - Created files may have wrong ownership
   - Solution: `--user $(id -u):$(id -g)` or chown in entrypoint

5. **SSH Agent Forwarding**
   - For git push/pull operations
   - Mount socket: `-v $SSH_AUTH_SOCK:/ssh-agent -e SSH_AUTH_SOCK=/ssh-agent`
   - Container needs `ssh-agent` setup

---

## Option B: Extend Claude Agent SDK ❌ NOT VIABLE

### Analysis

The SDK is a **compiled, minified Node.js module** (`cli.js` is 471KB of minified code). Key findings:

- **Source not available** - Cannot modify SDK internals
- **No built-in Docker support** - Confirmed by SDK investigation
- **spawnClaudeCodeProcess exists specifically for this** - SDK expects users to implement custom spawning

### Conclusion

This option is **not feasible**. The SDK developers intentionally provide the spawn hook for exactly this use case.

---

## Option C: Docker SDK/API from Node ⚠️ OVER-ENGINEERED

### Overview

Use a Node.js Docker client library (e.g., `dockerode`) to:
1. Create container
2. Attach streams
3. Start container
4. Manage lifecycle

### Example (dockerode)

```typescript
import Docker from 'dockerode';

const docker = new Docker();

const container = await docker.createContainer({
  Image: 'gemra-claude:latest',
  Cmd: ['node', '/cli.js', ...args],
  AttachStdin: true,
  AttachStdout: true,
  OpenStdin: true,
  HostConfig: {
    Binds: [`${workingDir}:/workspace`],
    NetworkMode: 'host'
  }
});

const stream = await container.attach({
  stream: true,
  stdin: true,
  stdout: true,
  stderr: true
});

await container.start();
```

### Advantages ✅

- Programmatic container management
- Better error handling
- Container reuse possible
- More control over lifecycle

### Disadvantages ❌

- **Additional dependency** (`dockerode` ~500KB)
- **More complex** - Need to emulate ChildProcess interface
- **Not needed** - Option A achieves same result simpler
- **Breaking Docker CLI** - If Docker CLI works, this is redundant

### Conclusion

Only consider if Option A fails or requires advanced features (e.g., persistent containers, health checks).

---

## Recommended Implementation Path

### Phase 1: Basic Docker Support (MVP)

**File:** `electron/src/main/agent/DockerSpawner.ts` (new)

```typescript
import { spawn, ChildProcess } from 'child_process';
import { SpawnOptions, SpawnedProcess } from '@anthropic-ai/claude-agent-sdk';

export interface DockerSpawnOptions {
  imageName: string;           // e.g., 'gemra-claude:latest'
  workingDir: string;          // Host path to mount
  cliPath: string;             // Path to SDK CLI
}

export function spawnDockerProcess(
  options: SpawnOptions,
  dockerOptions: DockerSpawnOptions
): SpawnedProcess {
  const dockerArgs = [
    'run',
    '-i',                                        // Interactive
    '--rm',                                      // Auto-remove
    '-v', `${dockerOptions.workingDir}:/workspace`,  // Mount workspace
    '-w', '/workspace',                          // Set workdir
    '-v', `${dockerOptions.cliPath}:/cli.js:ro`,// Mount CLI
    '--network', 'host',                         // Network access
    dockerOptions.imageName,                     // Image
    options.command,                             // 'node'
    '/cli.js',                                   // CLI path in container
    ...options.args                              // CLI arguments
  ];

  // Add environment variables
  for (const [key, value] of Object.entries(options.env)) {
    if (value !== undefined) {
      dockerArgs.splice(1, 0, '-e', `${key}=${value}`);
    }
  }

  // Spawn Docker
  const process: ChildProcess = spawn('docker', dockerArgs, {
    stdio: ['pipe', 'pipe', 'inherit'],
    signal: options.signal
  });

  return process; // ChildProcess satisfies SpawnedProcess!
}
```

**Integration in `ACPClient.ts`:**

```typescript
import { spawnDockerProcess } from './DockerSpawner';

async start(): Promise<void> {
  if (this.options.dockerOptions?.enabled) {
    this.emit('containerStatus', { status: 'starting' });
  }

  this.session = sdk.unstable_v2_createSession({
    model: 'claude-sonnet-4-5-20250929',
    pathToClaudeCodeExecutable: cliPath,
    workingDirectory: this.options.workingDirectory,
    env: { ...process.env, ...this.options.customEnv },

    ...(this.options.dockerOptions?.enabled && {
      spawnClaudeCodeProcess: (options) => {
        try {
          const dockerProcess = spawnDockerProcess(options, {
            imageName: this.options.dockerOptions.imageName || 'gemra-claude:latest',
            workingDir: this.options.workingDirectory,
            cliPath
          });

          dockerProcess.on('spawn', () => {
            this.emit('containerStatus', { status: 'running' });
          });

          dockerProcess.on('error', (error) => {
            this.emit('containerStatus', {
              status: 'error',
              error: error.message
            });
          });

          return dockerProcess;
        } catch (error) {
          this.emit('containerStatus', {
            status: 'error',
            error: error.message
          });
          throw error;
        }
      }
    })
  });
}
```

### Phase 2: Image Building & Management

**File:** `electron/src/main/agent/DockerImageBuilder.ts` (new)

```typescript
import { spawn } from 'child_process';
import { EventEmitter } from 'events';

export class DockerImageBuilder extends EventEmitter {
  async buildImage(
    dockerfilePath: string,
    tag: string,
    context: string
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const buildProcess = spawn('docker', [
        'build',
        '-t', tag,
        '-f', dockerfilePath,
        context
      ], { stdio: ['ignore', 'pipe', 'pipe'] });

      buildProcess.stdout.on('data', (data) => {
        this.emit('buildProgress', data.toString());
      });

      buildProcess.stderr.on('data', (data) => {
        this.emit('buildProgress', data.toString());
      });

      buildProcess.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Docker build failed with code ${code}`));
        }
      });
    });
  }

  async imageExists(tag: string): Promise<boolean> {
    return new Promise((resolve) => {
      const inspectProcess = spawn('docker', ['image', 'inspect', tag], {
        stdio: 'ignore'
      });

      inspectProcess.on('close', (code) => {
        resolve(code === 0);
      });
    });
  }
}
```

**Usage:**

```typescript
const builder = new DockerImageBuilder();

if (!await builder.imageExists('gemra-claude:latest')) {
  this.emit('containerStatus', { status: 'building' });

  builder.on('buildProgress', (output) => {
    console.log('[Docker Build]', output);
  });

  await builder.buildImage(
    'Dockerfile.claude',
    'gemra-claude:latest',
    this.options.workingDirectory
  );
}
```

### Phase 3: Error Handling & Polish

- **Docker not installed** - Check `which docker` before attempting spawn
- **Image build failures** - Surface errors to UI with actionable messages
- **Permission errors** - Guide user to add Docker to PATH / run daemon
- **Container crashes** - Detect exit codes and restart/fallback to host mode

---

## Key Files to Modify

| File | Purpose | Changes |
|------|---------|---------|
| `electron/src/main/agent/DockerSpawner.ts` | **(NEW)** Docker spawn logic | Create from scratch |
| `electron/src/main/agent/DockerImageBuilder.ts` | **(NEW)** Image building | Create from scratch |
| `electron/src/main/agent/ACPClient.ts` | SDK integration | Add `spawnClaudeCodeProcess` hook |
| `electron/src/renderer/components/claude/ClaudeChat.tsx` | Toggle handler | Implement `handleContainerToggle` |
| `electron/src/renderer/stores/tabStore.ts` | Tab agent update | Add method to replace agentId |

---

## docker-compose.claude.yml Analysis

Your existing compose file shows best practices:

```yaml
volumes:
  - .:/workspace                        # ✅ Working directory mount
  - claude-config:/home/node/.claude   # ✅ Persist Claude config
  - zig-cache:/home/node/.cache/zig    # ✅ Build cache

environment:
  - ANTHROPIC_BASE_URL=http://host.docker.internal:4000  # ✅ LiteLLM support
  - ANTHROPIC_API_KEY=sk-dummy                           # ✅ API key passthrough
  - TERM=xterm-256color                                  # ✅ Terminal colors

extra_hosts:
  - "host.docker.internal:host-gateway"  # ✅ Access host services
```

**Apply these patterns to docker run:**

```bash
docker run \
  -v $(pwd):/workspace \
  -v gemra-claude-config:/home/node/.claude \
  -e ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY \
  -e TERM=xterm-256color \
  --add-host host.docker.internal:host-gateway \
  gemra-claude:latest
```

---

## Testing Strategy

### Local Testing (Without Electron)

1. **Build image:**
   ```bash
   docker build -t gemra-claude:test -f Dockerfile.claude .
   ```

2. **Test interactive mode:**
   ```bash
   docker run -it --rm \
     -v $(pwd):/workspace \
     -w /workspace \
     gemra-claude:test bash
   ```

3. **Test CLI execution:**
   ```bash
   docker run -i --rm \
     -v $(pwd):/workspace \
     -w /workspace \
     -v /path/to/cli.js:/cli.js:ro \
     gemra-claude:test \
     node /cli.js --version
   ```

### Integration Testing

1. Create test agent in Electron
2. Toggle container on
3. Send simple prompt: "What files are in this directory?"
4. Verify tool use (Read, Bash) work correctly
5. Check file permissions on created files

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Docker not installed | Medium | High | Check at startup, show friendly error |
| Build takes too long | High | Medium | Cache image, build async on first launch |
| Permission issues | High | Medium | Use `--user` flag or document requirements |
| SSH keys not forwarded | Medium | High | Document SSH agent forwarding setup |
| Container networking issues | Low | High | Use `--network host` by default |
| SDK spawn hook breaks | Low | Critical | This is a documented SDK feature |

---

## Conclusion

**Option A (subprocess mode with spawnClaudeCodeProcess hook)** is the clear winner:

- ✅ Officially supported by SDK
- ✅ Simple implementation (~100 LOC)
- ✅ Full Docker isolation
- ✅ Maintains stdio communication
- ✅ No external dependencies

**Estimated Implementation Time:**
- Phase 1 (Basic Docker): 2-3 hours
- Phase 2 (Image building): 1-2 hours
- Phase 3 (Polish): 2-3 hours

**Total: 5-8 hours for full implementation**

---

## Next Steps

Ready to implement? Start with:

1. Create `DockerSpawner.ts` with basic spawn logic
2. Modify `ACPClient.ts` to use spawn hook
3. Test with existing Dockerfile.claude
4. Wire up toggle button in ClaudeChat.tsx

Want me to start writing the code?
