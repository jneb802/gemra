# Feature 3: Asynchronous GPU Command Submission

## Overview
Implement a double-buffered GPU command buffer system that allows the CPU to prepare next frame's commands while the GPU renders the current frame, eliminating CPU-GPU synchronization stalls and achieving consistent 120fps on ProMotion displays.

## Problem
Current rendering uses immediate-mode command submission: main thread builds command buffer, submits to GPU, waits (implicitly) for completion, then builds next frame. This creates a pipeline stall where CPU can't start work on frame N+1 until GPU has finished frame N, limiting frame rate and causing stutters during high render load.

## Proposed Solution

### 1. Double-Buffered Command Buffers
- Allocate two (or three for triple buffering) Metal command buffers statically
- Frame N uses buffer[i], Frame N+1 uses buffer[(i+1)%2]
- CPU writes to "next" buffer while GPU executes "current" buffer
- Semaphore/atomic flag swaps buffers after GPU completes

### 2. Incremental Buffer Updates
- Don't re-record static state (render pipeline, sampler, textures)
- Only record draw calls and dynamic uniform updates each frame
- Cache pipeline state object (already implemented)
- Use buffer coalition to allow CPU to re-use buffer memory

### 3. Completion Handler Architecture
```zig
const FrameContext = struct {
    buffer_index: usize,
    command_buffer: objc.id,
    completion_semaphore: std.Thread.ResetEvent,
};

fn renderFrame(ctx: *AppContext, frame_ctx: *FrameContext) void {
    const cmd_buf = frame_ctx.command_buffer;
    const encoder = objc.msgSend(objc.id, cmd_buf, objc.sel("renderCommandEncoderWithDescriptor:"), .{rp_desc});

    // Encode draw calls...

    objc.msgSendVoid(encoder, objc.sel("endEncoding"), .{});

    // Present with GPU callback
    const drawable = objc.msgSend(objc.id, ctx.layer, objc.sel("nextDrawable"), .{});
    objc.msgSendVoid(cmd_buf, objc.sel("presentDrawable:"), .{drawable});

    // Add completion handler to know when GPU is done
    const block = createBlock(&onFrameComplete, frame_ctx);
    objc.msgSendVoid(cmd_buf, objc.sel("addCompletedHandler:"), .{block});
    objc.msgSendVoid(cmd_buf, objc.sel("commit"), .{});
}

fn onFrameComplete(completion_buffer: objc.id, frame_ctx: *FrameContext) callconv(.c) void {
    // Signal that this buffer index is now free for reuse
    frame_ctx.completion_semaphore.set();
}
```

### 4. GPU-CPU Synchronization
- Per-buffer semaphore tracked in FrameContext
- Timer callback checks completed buffers and marks them reusable
- If no buffer available when frame starts, skip rendering (maintains pacing)
- Cap work ahead to 2-3 frames max

### 5. Frame Pacing
- Use CVDisplayLink or NSTimer with precise timing
- Target display refresh rate (query from NSScreen)
- Frame N rendered for display at Vsync, CPU working on frame N+1
- Proper triple buffering prevents v-sync stutter

### 6. Vertex Buffer Ring
- Allocate 3-4 large vertex buffers in a ring
- Each frame's vertices written to next available buffer
- GPU may still be reading from previous frames' buffers
- Use `-storageModeManaged` and `didModifyRange:` for explicit sync

## Performance Impact
- **Frame Time**: CPU frame prep drops from ~3-5ms to 0.5-1ms (GPU time unchanged)
- **Frame Rate**: Sustained 120fps achievable on M1/M2/M3 MacBooks
- **Smoothness**: No stutter during high-output scenarios (compiler logs, `ls -la` on large dirs)
- **Battery**: Lower CPU usage with consistent frame pacing

## Integration Points
- Modify `Renderer.render()` to be async/non-blocking
- Replace `delegateTimerFired` with frame pacing system
- Add FrameAllocator struct that manages command buffer ring
- Wire up Metal drawable acquisition with buffer availability

## Configuration
```zig
render {
    max_frame_ahead = 2        # How many frames CPU can be ahead
    use_triple_buffering = true
    enable_gpu_events = true   # For debug overlay
}
```

## Debug Tools
- Overlay showing GPU wait time vs CPU work time (ms)
- Counters:
  - `frames_skipped`: rendering couldn't keep up
  - `gpu_time_ms`: GPU execution duration
  - `cpu_work_ms`: CPU command buffer building time
  - `buffer_stalls`: times CPU waited for free buffer

## Zig Implementation Notes
- Use `std.atomic.Atomic(usize)` for lock-free buffer index cycling
- Compile-time selection of frame buffer count based on target refresh rate
- Zig's error unions for safe command buffer creation (fail gracefully)

## Comparison to Existing
This is standard in game engines and GPU apps but uncommon in terminal emulators due to complexity. Ghostty and wezterm both have async GPU work to some degree; this formalizes it as a priority.
