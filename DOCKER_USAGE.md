# Docker Container Mode for Claude Chat

Gemra supports running Claude agents in Docker containers for improved isolation and reproducible environments.

## Features

- **One-click toggle** - Switch between host and container modes instantly
- **Automatic image building** - First run builds the Docker image automatically
- **Live status** - See when container is building, starting, or running
- **Full isolation** - Agent runs in containerized environment
- **Workspace mounting** - Working directory is mounted for seamless file access

## Requirements

- **Docker** must be installed and running
  - macOS: [Docker Desktop](https://www.docker.com/products/docker-desktop)
  - Linux: `sudo apt install docker.io` or equivalent
- Docker daemon must be running (check with `docker --version`)

## Usage

### Quick Start

1. **Open Gemra** and create a Claude chat tab
2. **Click the Container button** in the status bar (bottom of window)
3. **First run**: Docker image will build (takes 2-5 minutes)
4. **Subsequent runs**: Container starts immediately

### Status Indicators

The container button shows current status:

| Status | Icon | Description |
|--------|------|-------------|
| **Off** | Gray | Running on host (normal mode) |
| **Building image...** | 🔄 Orange spinner | Docker image is being built |
| **Starting...** | 🔄 Orange spinner | Container is starting up |
| **Running** | 🟢 Green dot | Agent running in container |
| **Error** | ✕ Red | Something went wrong (hover for details) |

### Toggling Modes

- Click "Off" → Switches to container mode
- Click "Running" → Switches back to host mode
- **Note**: Toggling restarts the agent and clears chat history

### What Gets Containerized?

**Inside the container:**
- Claude CLI process
- Node.js runtime
- Zig compiler (for this project)
- Git, GitHub CLI (gh)
- All tools and commands

**Mounted from host:**
- Your working directory (`/workspace` in container)
- Claude SDK CLI executable
- Environment variables (API keys, git config)

**Network:**
- Host network mode (access localhost services)
- `host.docker.internal` available (for LiteLLM, etc.)

## Docker Image

The Docker image is built from `Dockerfile.claude`:

```dockerfile
FROM node:20-bookworm
# Includes: git, vim, ripgrep, gh, zig, Claude CLI
# User: node (non-root)
# Working directory: /workspace
```

**Image name:** `gemra-claude:latest`

### Managing Images

```bash
# List images
docker images | grep gemra

# Rebuild image (if you modify Dockerfile.claude)
docker build -t gemra-claude:latest -f Dockerfile.claude .

# Remove image
docker rmi gemra-claude:latest
```

## Troubleshooting

### "Docker not found" Error

**Cause:** Docker is not installed or not in PATH

**Fix:**
```bash
# macOS (Homebrew)
brew install docker

# Linux
sudo apt install docker.io

# Verify
docker --version
```

### "Docker daemon not running" Error

**Cause:** Docker Desktop is not running

**Fix:**
- **macOS**: Open Docker Desktop app
- **Linux**: `sudo systemctl start docker`

### Build Fails

**Cause:** Network issues, Docker Hub timeout, or syntax error in Dockerfile

**Fix:**
1. Check your internet connection
2. Retry the toggle (will attempt rebuild)
3. Build manually to see full error:
   ```bash
   cd /path/to/gemra
   docker build -t gemra-claude:latest -f Dockerfile.claude .
   ```

### Container Starts Then Crashes

**Cause:** CLI mounting failed or environment variables missing

**Check logs:**
```bash
# List all containers (including stopped)
docker ps -a

# View logs from last container
docker logs $(docker ps -aq --filter ancestor=gemra-claude:latest | head -1)
```

### File Permission Issues

**Cause:** Container user (node) has different UID than host user

**Temporary fix:** Files created in container may have wrong ownership. Change ownership:
```bash
sudo chown -R $USER:$USER .
```

**Permanent fix:** Update `Dockerfile.claude` to match your UID:
```dockerfile
RUN usermod -u $(id -u) node && groupmod -g $(id -g) node
```

## Advanced Configuration

### Custom Image Name

By default, uses `gemra-claude:latest`. To use a custom image:

1. Build your image:
   ```bash
   docker build -t my-custom-image:v1 -f Dockerfile.claude .
   ```

2. Modify `DockerOptions` in code (currently hardcoded):
   ```typescript
   dockerOptions: {
     enabled: true,
     imageName: 'my-custom-image:v1'
   }
   ```

### Persistent Volumes

The Dockerfile.claude uses named volumes for caching:

```yaml
volumes:
  - claude-config:/home/node/.claude    # Claude settings
  - zig-cache:/home/node/.cache/zig     # Build cache
```

These persist between container runs for faster builds.

**List volumes:**
```bash
docker volume ls | grep gemra
```

**Clean up volumes:**
```bash
docker volume prune
```

### Environment Variables

All environment variables are passed to the container:

- `ANTHROPIC_API_KEY` - Your API key
- `ANTHROPIC_BASE_URL` - Custom API endpoint (e.g., LiteLLM)
- `GIT_USER_NAME` - Git author name
- `GIT_USER_EMAIL` - Git author email

**Custom variables**: Modify `DockerSpawner.ts` to add more.

## Performance

| Metric | Host Mode | Container Mode |
|--------|-----------|----------------|
| **First startup** | Instant | 2-5 min (builds image) |
| **Subsequent startups** | Instant | 2-3 seconds |
| **Prompt latency** | Same | Same |
| **File operations** | Same | ~5% slower (volume overhead) |
| **Memory usage** | ~100 MB | ~150 MB (Docker overhead) |

## Security

Container mode provides:
- ✅ **Process isolation** - Agent runs in separate namespace
- ✅ **Filesystem isolation** - Only working directory is accessible
- ✅ **Network isolation** - Uses host network (optional: can restrict)
- ⚠️ **Not a sandbox** - Container has host network and mounted workspace

**Not suitable for:**
- Running untrusted code (use proper sandboxing)
- Multi-tenant environments
- Air-gapped/offline systems (requires Docker Hub access for base image)

## Comparison: Host vs Container

| Feature | Host Mode | Container Mode |
|---------|-----------|----------------|
| **Setup** | None | Install Docker |
| **First run** | Instant | 2-5 min build |
| **Startup time** | <100ms | 2-3 seconds |
| **Isolation** | None | Full container |
| **Reproducibility** | System-dependent | Dockerfile-defined |
| **SSH keys** | Direct access | Mounted socket |
| **Git operations** | Native | Via mounted workspace |
| **Network access** | Full | Full (host mode) |

## Development

### Adding Tools to Container

Edit `Dockerfile.claude`:

```dockerfile
# Install additional tools
RUN apt-get update && apt-get install -y \
    your-tool-here \
    && rm -rf /var/lib/apt/lists/*
```

Rebuild:
```bash
docker build -t gemra-claude:latest -f Dockerfile.claude .
```

### Debugging Container

Start an interactive shell:

```bash
docker run -it --rm \
  -v $(pwd):/workspace \
  -w /workspace \
  gemra-claude:latest \
  bash
```

### Viewing Container Logs

The Docker spawner logs to console. Check Electron main process logs:

```bash
# In dev mode, logs appear in terminal where you ran `npm run dev`
# In production, check system logs or redirect stderr
```

## Future Enhancements

- [ ] Settings to persist container preference per project
- [ ] GPU passthrough for CUDA workloads
- [ ] Resource limits (CPU/memory caps)
- [ ] Multi-architecture images (ARM64, x86_64)
- [ ] Offline mode (cache base image)
- [ ] Container health checks
- [ ] Volume cleanup on toggle
- [ ] Custom Dockerfile per project

## FAQ

**Q: Will this work on Windows?**
A: Not tested yet. Docker Desktop for Windows should work, but WSL2 required.

**Q: Can I use Podman instead of Docker?**
A: Possibly. Podman is Docker-compatible. Alias `docker=podman` and try it.

**Q: Does this support M1/M2 Macs (ARM)?**
A: Yes! The base image `node:20-bookworm` has ARM64 support.

**Q: Why does the first run take so long?**
A: Building the Docker image downloads ~500MB of dependencies. Cached after first build.

**Q: Can I run multiple agents in containers?**
A: Yes! Each agent gets its own container (auto-removed on exit).

**Q: How do I update the container image?**
A: Delete the old image (`docker rmi gemra-claude:latest`) and toggle again.

## Support

- **Issues**: Report bugs at https://github.com/yourusername/gemra/issues
- **Docs**: See `DOCKER_IMPLEMENTATION_ANALYSIS.md` for technical details
- **Logs**: Check Electron DevTools console for errors
