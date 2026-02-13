# Feature 1: Damage-Region Optimized Rendering

## Overview
Implement a sophisticated damage tracking system that only redraws terminal cells that have changed, dramatically reducing GPU bandwidth and CPU usage, especially for cursor animations, status bar updates, and rapid terminal output.

## Problem
Currently, the renderer rebuilds vertex buffers and issues GPU draw calls for the entire terminal grid on every frame, even when only a few cells have changed. This wastes significant GPU resources and battery life on laptops.

## Proposed Solution

### 1. Dirty Cell Tracking
- Maintain a per-row dirty flag array that gets set when terminal cells change
- Extend to per-cell dirty flags for more granular updates (optional optimization)
- Track cursor movement as a separate dirty region
- Incorporate selection changes as dirty regions

### 2. Incremental Vertex Buffer Updates
Instead of rebuilding the entire vertex buffer:
- Keep persistent vertex buffer with stale data for unchanged cells
- Only update vertex data for dirty cells/regions
- Use `didModifyRange:` on the Metal buffer to inform GPU of changes
- For animations (cursor blink), use separate vertex buffer or uniform updates only

### 3. Frame Coalescing
- Accumulate multiple terminal updates that happen within the same frame interval
- Single render pass for all accumulated changes
- Configurable max frame rate (default 60fps, optional 120fps for ProMotion displays)

### 4. Region-Based Rendering
- When only a small region is dirty, use scissor test to limit rendering
- Set Metal scissor rect to damaged area only
- Clear only the damaged region (or use load action = dontCare for unaffected areas)

## Benefits
- **Performance**: 50-90% reduction in GPU work for typical workflows
- **Battery Life**: Less GPU activity = lower power consumption on macBooks
- **Smoothness**: More headroom for animations (cursor blink, smooth scroll)
- **Scalability**: Works better at high resolution (Retina, 4K) where cell count is high

## Implementation Notes
- Add dirty tracking to `terminal.Terminal` state that mirrors render state updates
- Modifications to cells through ghostty-vt should automatically flag dirty rows
- Cursor movement should dirty the old and new cursor positions
- Selection changes dirty affected rows
- Maintain a timestamp/last-rendered version to coalesce rapid changes

## Zig-Specific Considerations
- Use Zig's arena allocator for temporary vertex buffer updates to minimize allocations
- Compile-time configuration for maximum dirty cell count (tune based on typical use)
- Leverage Zig's struct-of-arrays for cache-friendly dirty flag storage

## References
- Similar approach used in modern game engines and GUI toolkits
- Ghostty has damage tracking (research implementation pattern)
- Metal buffer modification hints (`didModifyRange:`) for optimal GPU upload
