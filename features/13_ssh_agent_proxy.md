# Feature 13: SSH Agent Proxy & Connection Management

## Overview
Integrate SSH agent forwarding and connection management directly into the terminal emulator, providing secure, persistent SSH identity handling with automatic agent forwarding, connection pooling, and simplified remote session access.

## Problem
SSH workflows require manual agent setup:
- Users must run `ssh-agent` and add keys manually per session
- Agent forwarding must be configured per-connection (`ssh -A`)
- Multiple terminals each may start their own agent (inconvenient)
- No integrated UI to manage connections, keys, or agent sockets
- Security: agent sockets accessible to any local process if forwarded

## Proposed Solution

### 1. Built-in SSH Agent
- Implement `ssh-agent` protocol (RFC 4252, Section 7) directly in Zig
- Generate and store keys in encrypted storage (macOS Keychain or encrypted file)
- Agent lifecycle managed by terminal daemon, not per-session
- Single agent for entire application (shared across tabs/windows)

**Supported operations**:
- `SSH_AGENTC_REQUEST_IDENTITIES` → list stored keys
- `SSH_AGENTC_SIGN_REQUEST` → sign data with specific key
- `SSH_AGENTC_ADD_IDENTITY` → add new key (encrypted)
- `SSH_AGENTC_REMOVE_IDENTITY` → remove key
- `SSH_AGENTC_LOCK` / `UNLOCK` → protect with passphrase

### 2. Automatic Agent Forwarding
When opening SSH connection:
1. Detect remote host (read from command/PTY output)
2. If user has key(s) for that host in agent, prompt:
   "Forward SSH agent to `host`? (Y/n/always)"
3. If yes, set `SSH_AUTH_SOCK` environment in PTY to our socket
4. `ssh` client automatically uses forwarded agent
5. Remember preference per-host (config file)

**Implementation**:
```zig
fn maybeAgentForward(pty: *Pty, hostname: []const u8) void {
    const should_forward = config.shouldForwardAgent(hostname);
    if (should_forward == .prompt) {
        const response = showPrompt("Forward SSH agent to " ++ hostname ++ "? (Y/n/always)");
        switch (response) {
            .yes => { /* forward this time */ },
            .always => { /* remember and forward */ },
            .no => { /* don't forward */ },
        }
    } else if (should_forward == .yes) {
        // Set SSH_AUTH_SOCK env var in PTY
        // Need to intercept exec() or set env before spawn
        // PTY already has env from parent; update carefully
    }
}
```

### 3. Connection Pooling
Reuse existing SSH connections (ControlMaster-style):
- Maintain pool of multiplexed connections per host/user
- When user runs `ssh user@host`, check if pooled connection exists
- If yes, route through existing socket (faster)
- Pool idle timeout (default 5 minutes)

**Data structure**:
```zig
const SshPool = struct {
    connections: std.AutoHashMap(HostKey, Connection),
    mutex: std.Thread.Mutex,
};

const Connection = struct {
    master_socket: posix.fd_t,     // Unix domain socket to master
    slave_pty: posix.fd_t,         // PTY for sessions sharing this connection
    last_used: i128,               // Timestamp for LRU eviction
    refcount: u32,                 // Active sessions using this connection
};
```

When new `ssh` command detected via PTY execve hook:
1. Parse command line: `ssh [user@]host [command]`
2. Look up pool entry for `(user, host)`
3. If exists and alive: create new slave PTY, forward through master socket
4. If not: spawn new connection and add to pool

**Challenge**: Must intercept before ssh spawns. Options:
- Hook `execve` via ptrace (heavy)
- Use wrapper script (`gemra-ssh`) that manages pool
- Use `ProxyCommand` in user's `~/.ssh/config` automatically

Easier: provide wrapper command `gemra-ssh` that user puts in PATH:
```
Host *
    ProxyCommand gemra-ssh-proxy %h %p
```

### 4. Direct Connect Feature
Allow user to open SSH session via UI:
- `Cmd+Shift+N` → "Connect to..." dialog
- Enter host, username, identity
- Opens new tab/window with SSH session
- Manages connection via pooled agent

### 5. Agent UI
- Visual indicator in tab bar when agent forwarding active
- Overlay showing active forwarded connections
- Command palette: "SSH: Add Identity", "SSH: Remove Key", "SSH: List Connections"
- Right-click context menu on hostname in terminal output → "Connect", "Send file", etc.

### 6. Security Model
- Agent socket owned by user, mode 0600
- Forwarded agent socket inside PTY: set `SSH_AUTH_SOCK` to socket in private namespace
- Use `socketpair()` with `AF_UNIX` and `SOCK_STREAM`
- Ensure only processeswith access to gemra's memory can reach agent
- Optional: per-connection agent restrict (request forward only for specific keys)

### 7. Key Management
Store identities in macOS Keychain:
```zig
const KeychainQuery = struct {
    service: "gemra.ssh",
    account: key_fingerprint,
    // Encrypted private key blob
};

fn addIdentity(private_key_pem: []const u8, passphrase: ?[]const u8) void {
    const key = parsePemPrivateKey(private_key_pem);
    const fingerprint = key.fingerprint();
    keychain.set(fingerprint, encrypt(private_key_pem, passphrase));
    agent.addIdentity(key);  // Decrypts on use
}
```

Or simpler: keep unencrypted in memory only (agent standard), but use macOS Keychain for persistence.

### 8. Integration with OpenSSH
- Our agent speaks standard protocol → works with `ssh`, `scp`, `rsync`, `git`
- No patches needed to OpenSSH client
- `SSH_AUTH_SOCK` points to our socket

### 9. Implementation Phases

**Phase 1**: Agent core
- Implement agent protocol responder
- Store keys in memory (no persistence)
- Respond to `ssh` client requests

**Phase 2**: Key storage
- Add Keychain integration (macOS) / libsecret (Linux)
- Import/export PEM keys
- Generate new key pairs (RSA, Ed25519, ECDSA)

**Phase 3**: ProxyCommand integration
- Provide `gemra-ssh-proxy` binary
- Document setup for `~/.ssh/config`

**Phase 4**: Connection pooling
- Track existing connections
- Reuse via slave PTY allocation

**Phase 5**: UI elements
- Status indicators
- Connection list
- Settings for forwarding defaults

### 10. Edge Cases
- **Agent unlock**: If key encrypted, prompt for passphrase (UI)
- **Key removal**: When key deleted from agent, existing connections unaffected (keys already shared)
- **Agent restart**: Keys lost → prompt to reload from storage
- **Multiple hosts**: Agent can forward to any number of hosts simultaneously

### 11. Platform Support
- **macOS**: Primary target (Keychain)
- **Linux**: Secondary (libsecret, freedesktop secrets)
- **Windows**: Possibly via Windows Credential Manager later

### 12. Configuration
```json
{
  "ssh": {
    "agent": {
      "enabled": true,
      "persist_keys": true,
      "keychain_service": "gemra.ssh.agent"
    },
    "pooling": {
      "enabled": true,
      "max_connections_per_host": 5,
      "idle_timeout_sec": 300
    },
    "forwarding": {
      "prompt_on_first_use": true,
      "auto_forward_patterns": ["*.internal"],
      "never_forward": ["*.public.cloud"]
    }
  }
}
```

## References
- OpenSSH agent protocol: https://datatracker.ietf.org/doc/html/draft-miller-ssh-agent-10
- libssh2 agent implementation
- GNU Guix `guix` package manager's connection pooling

## Benefits
- Seamless key management
- Performance: connection reuse saves handshake latency
- Security: agent restricted to terminal process, not whole system
- UX: discoverable, visual feedback
