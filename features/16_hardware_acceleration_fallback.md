# Feature 16: Multi-Backend Rendering (Metal/Vulkan/Software)

## Overview
Implement a pluggable rendering backend architecture with multiple GPU backends (Metal on macOS, Vulkan/OpenGL on Linux/Windows) plus a CPU software fallback, ensuring the terminal runs everywhere with optimal performance on each platform.

## Problem
Current: Metal-only, macOS only.
Limitations:
- No Windows or Linux support
- On older macOS hardware without Metal 2 support, app won't run
- No software fallback for headless/CI environments
- Can't run on integrated GPUs with poor Metal drivers

## Proposed Solution

### 1. Backend Abstraction Layer
Define common rendering interface:
```zig
pub const RendererBackend = struct {
    init: fn (alloc: std.mem.Allocator, width: f32, height: f32, config: BackendConfig) anyerror!Renderer,
    render: fn (self: *Renderer, term: *Terminal) void,
    deinit: fn (self: *Renderer) void,
    resize: fn (self: *Renderer, width: f32, height: f32) void,
    present: fn (self: *Renderer) void,  // Swap buffers, etc.
    allocateTexture: fn (self: *Renderer, desc: TextureDesc) anyerror!Texture,
    updateTexture: fn (self: *Renderer, tex: Texture, data: []const u8) void,
    // ...
};
```

Each backend implements these functions.

### 2. Backend Implementations

#### Metal Backend (Current)
- Location: `src/renderer.zig` → `MetalRenderer`
- macOS only (uses Objective-C bridge)
- High performance, low latency
- Requires macOS 10.14+ (Metal 2)

#### Vulkan Backend (Linux/Windows)
- Use `zvvulkan` Zig bindings or `vulkan-zig`
- Cross-platform (Linux, Windows, Android)
- High performance like Metal
- Requires Vulkan 1.1+ GPU
- Separate shader files (`.comp`, `.frag`, `.vert` in GLSL/HLSL → SPIR-V)

Implementation notes:
- Use `VkInstance`, `VkDevice`, `VkSwapchainKHR`
- Descriptor sets for textures/buffers
- Pipeline cache for shader reuse
- Backend-specific error handling (validation layers optional)

#### OpenGL Backend (Fallback)
- Use `zgl` or raw OpenGL 3.3+ bindings
- Widely supported (works on old hardware)
- Lower performance than Vulkan/Metal (driver overhead)
- Simpler to implement than Vulkan

#### Software Renderer (CPU)
- Pure Zig rasterizer (no GPU)
- Useful for testing, headless servers, CI
- Draw text using `std.fs` → bitmap → write to PNG/PPM
- Or SDL2 surface blit if using SDL2 backend

### 3. Platform Detection & Selection

At startup in `main.zig`:
```zig
const backend_name = std.os.getenv("GEMRA_RENDERER") orelse defaultBackendForOS();

const backend: RendererBackend = switch (backend_name) {
    "metal" => try MetalBackend.init(...),
    "vulkan" => try VulkanBackend.init(...),
    "opengl" => try OpenGLBackend.init(...),
    "software" => try SoftwareBackend.init(...),
    else => error.UnknownBackend,
};
```

Default by OS:
- macOS → Metal
- Linux → Vulkan (if available), else OpenGL, else software
- Windows → Vulkan (or DirectX 12? maybe later)

Environment variable allows override:
- `GEMRA_RENDERER=metal` even on Linux (if MoltenVK installed)
- `GEMRA_RENDERER=software` for debugging

### 4. Unified Shader Strategy

Problem: Each backend has different shading language.
- Metal: Metal Shading Language (`.metal`)
- Vulkan: GLSL/HLSL → SPIR-V
- OpenGL: GLSL

Solutions:
1. **Write shaders in GLSL, transpile**:
   - Use `glslang` or `shaderc` to compile to SPIR-V for Vulkan
   - For Metal: use `metal-objc` transpiler or write separate .metal
2. **Write separate shaders per backend** (simpler to maintain)
   - `shaders/terminal.metal`
   - `shaders/terminal.vert` + `shaders/terminal.frag` (GLSL)
   - Keep logic identical, but syntax differences
3. **Use Naga** (Rust shader translator) via FFI → complex

Decision: Option 2 (separate shaders) for clarity. Minimal duplication (vertex transformation, fragment sampling).

### 5. Surface/Windowing Abstraction

Need platform-specific window/context creation:
- **macOS**: NSWindow + CAMetalLayer (Metal), NSOpenGLView (OpenGL - deprecated)
- **Linux**: X11 + GLX/X11+Vulkan, or Wayland+Vulkan
- **Windows**: Win32 + DXGI (Vulkan), WGL (OpenGL)

Solution: Use GLFW or SDL2 for cross-platform windowing?
- GLFW supports Metal? No.
- SDL2 supports Metal (2.0+), Vulkan, OpenGL
- Could abstract with SDL2 for window + input, then choose renderer

But we already have substantial macOS-specific code (objc.zig, Cocoa). Would need to rewrite for SDL2.
- Extract input handling to platform layer
- Keep terminal core platform-independent
- Accept: maintain separate `window_*.zig` per platform

**Decision**: Platform-specific modules:
```
src/
  window/
    darwin.zig   (current)
    linux_x11.zig
    windows_win32.zig
    wayland.zig (optional)
  renderer/
    metal.zig
    vulkan.zig
    opengl.zig
    software.zig
```

### 6. Build System Changes

In `build.zig`:
```zig
const target = b.standardTargetOptions(.{});
const optimize = b.standardOptimizeOption(.{});

// Select renderer backend
const renderer_backend = b.option([]const u8, "renderer", "Renderer backend (metal, vulkan, opengl, software)") orelse
    if (target.os.tag == .macos) "metal" else "vulkan";

exe_mod.addImport("renderer_backend", b.createModule(.{
    .root_source_file = b.path("src/renderer/" ++ renderer_backend ++ ".zig"),
}));

// Link Vulkan/OpenGL libraries conditionally
if (renderer_backend == "vulkan") {
    exe.linkSystemLibrary("vulkan");
    exe.linkSystemLibrary("wayland-client"); // if using Wayland
}
if (renderer_backend == "opengl") {
    exe.linkSystemLibrary("GL");
}
```

### 7. Font Atlas (Cross-Backend)

Renderer backends need to provide:
- Texture creation from font atlas bitmap
- Sampler state (nearest-neighbor)
- Vertex/index buffers

Extract `atlas.zig` to be backend-agnostic, but it uses Metal types currently (`objc.id` for texture).
Abstract:
```zig
pub const Texture = union(enum) {
    metal: objc.id,
    vulkan: vk.Image,
    opengl: gl.GLuint,
    software: *SoftwareTexture,
};

pub const TextureInterface = struct {
    create: fn (width: u32, height: u32, format: Format) Texture,
    destroy: fn (tex: Texture) void,
    update: fn (tex: Texture, data: []const u8) void,
};
```

### 8. Input Layer

Currently `window.zig` handles key/mouse via ObjC callbacks.
For other platforms, need similar event loop:
- GLFW/SDL2 callbacks → same internal `input.zig` encoding
- Platform-specific keycode mapping to `ghostty.input.Key`

Could write `input_glfw.zig`, `input_sdl.zig`, etc.

### 9. PTY Layer

Currently `pty.zig` uses POSIX `openpty`, `fork`, etc.
- Works on macOS, Linux, BSD
- Windows needs different approach: ConPTY (Windows 10+) or Cygwin pty
- Could wrap with platform abstraction:
  ```zig
  // src/pty/posix.zig
  // src/pty/windows.zig
  ```

But focus on non-Windows initially: macOS + Linux.

### 10. Migration Plan

**Phase 1**: Extract current Metal renderer into `renderer/metal.zig` behind interface
**Phase 2**: Add Vulkan backend on Linux (test on X11 first)
**Phase 3**: Add OpenGL backend as fallback
**Phase 4**: Add software backend (headless)
**Phase 5**: Build system selection, command-line flags
**Phase 6**: Wayland support (Vulkan or OpenGL)

### 11. Testing Matrix

OS × Backend:
- macOS: Metal ✓
- Linux: Vulkan ✓, OpenGL ✓, Software ✓
- Windows: (future)

CI: Software backend on CPU can run headless tests.

### 12. Performance Targets
- Metal: 120fps at 4K (existing)
- Vulkan: Match Metal performance on Linux with good GPU
- OpenGL: 60fps acceptable, lower GPU usage
- Software: 30fps at 1080p (single-core)

### 13. Configuration
```json
{
  "renderer": {
    "backend": "auto",  // or "metal", "vulkan", "opengl", "software"
    "vulkan": {
      "use_validation": false,
      "gpu_index": 0
    },
    "opengl": {
      "debug_context": false
    }
  }
}
```

## Complexity & Risk
- **High**: Multiple backends multiply testing surface
- **Maintenance**: Shader changes need to be replicated
- **Benefit**: Cross-platform, broader user base, hardware fallback

## Alternatives
- **SDL2 only**: Let SDL2 abstract everything. But less control, indirect.
- **WebGPU future**: Wait for WebGPU stable and use `zgpu` → cross-platform. But not ready yet.

## Conclusion
This is a large architectural change. Implement incrementally: first refactor current Metal code behind interface, then add second backend (Vulkan or OpenGL). Don't sacrifice quality on Metal (primary target) to enable others.

## References
- wgpu architecture (backend abstraction)
- Alacritty rendering architecture (OpenGL only, but well-designed)
- WezTerm (Vulkan + GPU rendering)
