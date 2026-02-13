# Feature 21: GPU Profiling Overlay and Performance Metrics

## Overview
Add an optional, developer-focused performance overlay showing real-time GPU/CPU metrics (frame time, buffer usage, vertex count, render pass duration) to help diagnose performance issues, tune rendering parameters, and verify optimizations are working.

## Problem
Developers working on performance have no visibility into:
- Actual frame rate vs target
- GPU command buffer build time
- Vertex count per frame
- Texture/bandwidth usage
- Stalls and dropped frames
- Thread synchronization delays

Debugging performance is guesswork without instrumentation.

## Proposed Solution

### 1. Overlay Display Modes
- **Off**: No overlay (default for users)
- **Simple**: Current FPS, frame time (ms), dropped frames indicator
- **Detailed**: FPS + GPU time + CPU time + vertex count + draw calls + buffer sizes
- **Developer**: All metrics + histogram, min/max/avg, per-feature breakdown

Toggle with `Cmd+Shift+P` → "Show Performance Stats" (command palette).

### 2. Metrics to Collect

#### Frame Timing
- **Frame Time**: Total time between delegateTimerFired calls (ms)
- **GPU Time**: Time GPU spent executing command buffer (query using GPU counters or timestamp)
- **CPU Work Time**: Time spent in `Renderer.buildVertices()` and command encoding
- **Idle Time**: Frame time - (CPU + GPU) → time waiting for display

#### Rendering Metrics
- **Vertex Count**: Total vertices in current frame
- **Cell Count**: Terminal cells rendered (visible + padding)
- **Draw Calls**: Number of `drawPrimitives` calls (usually 1-2)
- **Texture Binds**: Atlas texture + any images (if sixel enabled)

#### Memory/Bandwidth
- **Vertex Buffer Size**: Bytes allocated
- **Atlas Texture Size**: Width × Height × 4
- **Bandwidth Estimate**: (vertices × vertex_size) + texture uploads per frame

#### Terminal State
- **Rows × Cols**: Grid dimensions
- **Dirty Rows**: Count of rows flagged for redraw
- **Scroll Position**: Current scroll offset (for scroll animation debug)
- **Selection**: Active or not

### 3. Implementation

#### GPU Timestamp Queries (Metal)
Metal provides GPU timing via `MTLCommandBuffer` GPU timestamps:
```zig
// Not super precise but approximate
const gpu_start = cmd_buf.gpuStartTimestamp();
// ... encode draw calls ...
const gpu_end = cmd_buf.gpuEndTimestamp();
const gpu_ns = gpu_end - gpu_start;
```

More precise: use `MTLSharedEvent` and `addScheduledHandler` to get GPU timing.

Or use `os_signpost` for Instruments integration.

#### CPU Timing
```zig
const cpu_start = std.time.nanoTimestamp();
self.buildVertices(term);
const cpu_end = std.time.nanoTimestamp();
const cpu_ns = cpu_end - cpu_start;
```

#### Frame Counter
Maintain rolling stats:
```zig
const Stats = struct {
    frame_times: [120]u64 = .{0} ** 120,  // 2 seconds at 60fps
    index: usize = 0,
    dropped_frames: u64 = 0,
    last_presentation: i128 = 0,

    pub fn addFrame(self: *Stats, duration_ns: u64) void {
        self.frame_times[self.index] = duration_ns;
        self.index = (self.index + 1) % self.frame_times.len;
    }

    pub fn avgFrameTime(self: *Stats) f64 {
        var sum: u64 = 0;
        for (self.frame_times) |t| sum += t;
        return @as(f64, @floatFromInt(sum)) / @as(f64, @floatFromInt(self.frame_times.len));
    }
};
```

### 4. Overlay Rendering
Draw overlay as HUD in corner:
- Use same renderer (text atlas) to draw stats as text
- Semi-transparent background box (rgba(0,0,0,0.6))
- Monospaced font essential for alignment
- Position: top-right (default) or configurable

Text format (simple mode):
```
FPS: 60.0 | 16.6ms
GPU: 3.2ms | CPU: 0.8ms
Vtx: 12,345
```

Detailed:
```
───────── Performance Stats ─────────
FPS:      60.0 (target 60)
Frame:    16.6ms
  GPU:     3.2ms (19%)
  CPU:     0.8ms ( 5%)
  Idle:   12.6ms (76%)
Vertices: 12,345 (3,300 cells)
Dirty:    24 rows (12%)
Dropped:  0
───────── Memory ─────────────────────
VBO:      1.2 MB
Atlas:    4.0 MB (2048² RGBA)
─────────────────────────────────────
```

Update overlay every N frames (every 5? to not clutter).

### 5. Configuration
```json
{
  "debug": {
    "performance_overlay": "off",  // "off", "simple", "detailed", "developer"
    "overlay_position": "top-right",  // "top-left", "top-right", "bottom-left", "bottom-right"
    "overlay_opacity": 0.85,
    "history_seconds": 2,  // How many seconds of history for graphs
    "log_metrics": false  // Write CSV to file
  }
}
```

### 6. Logging to File
If `debug.log_metrics = true`:
- Write CSV line per frame to `~/.config/gemra/metrics.csv`
- Columns: timestamp, frame_time, gpu_time, cpu_time, vertex_count, dirty_rows, fps
- Can post-process with spreadsheet or Python (matplotlib)

### 7. Performance HUD Controls
- `Cmd+Shift+P` → cycle modes (off → simple → detailed → dev → off)
- Click on HUD to pin/unpin (always visible)
- Color code: red if frame time > 16.67ms (60fps), yellow > 33ms (30fps)

### 8. Finding Bottlenecks
- If **GPU time ≈ frame time**: Rendering expensive (too many cells, complex shader)
  - Check vertex count; optimize cell rendering
  - Reduce grid size or simplify fill
- If **CPU time ≈ frame time**: CPU-bound (vertex buffer rebuild, text shaping)
  - Optimize `buildVertices`, damage tracking
  - Profile with Instruments/Valgrind
- If **Idle time**: Frame rate capped by timer (60Hz), no action needed
- If **Dropped frames**: Frame took longer than interval → increase target fps or reduce work

### 9. Developer Features (optional)
- **Histogram view**: Graph of frame times over last 5 seconds (ASCII line graph)
- **Hotkeys**: `F1` → screenshot of metrics to file
- **Export**: JSON dump of current stats for bug reports
- **Breakpoints**: Pause rendering when FPS drops below threshold (for debugging)

### 10. Integration with Other Features
Combine with damage tracking feature:
- Show dirty row count (%)
- Show buffer rebuild time (expected to drop with damage tracking)
- Track actual vs target fps

### 11. Platform Differences
- **Metal**: Use `gpuStartTimestamp`/`gpuEndTimestamp` if available (requires macOS 10.13+)
- **Vulkan**: Use `vkCmdWriteTimestamp` with `VK_TIMESTAMP_QUEUE_GENERAL`
- **Software**: CPU time only, GPU time = 0

### 12. Build Configuration
Wrap in `if (builtin.mode == .Debug)` or feature flag:
```zig
const enable_profiling = b.option(bool, "profile", "Enable performance overlay") orelse false;
if (enable_profiling) {
    exe_mod.addImport("profiling", .{ .source = "src/debug/profiling.zig" });
}
```

Else: no codegen overhead.

### 13. Implementation Plan
1. Create `debug/Profiler` struct with atomic stats collection
2. Integrate into `Renderer.render()` to capture CPU/GPU timings
3. Overlay renderer: draw text overlay
4. Toggle keybinding and config
5. CSV logging
6. Testing: verify numbers plausible

### 14. Validation
- Confirm GPU time matches external tools (Xcode Instruments, Metal System Trace)
- Verify vertex count matches actual quit count
- Check FPS matches display refresh rate

### 15. Privacy/Security
Overlay shows no sensitive data. Safe for all users.

## References
- Frame timing in game engines (Unity Profiler, Unreal Insights)
- Metal GPU counter instrumentation
- WezTerm's per-frame performance stats (Rust)

This feature is essential for performance tuning and demonstrating the impact of other optimizations like damage tracking and async GPU submission.
