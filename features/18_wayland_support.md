# Feature 18: Wayland Display Server Support

## Overview
Add Wayland compositor support to run gemra on Linux distributions using Wayland (most modern distros) instead of X11, leveraging modern Linux graphics stack with Vulkan renderer and achieving better security/permissions through Wayland's sandboxed design.

## Problem
Current:
- Linux support not implemented (PTY code is POSIX, okay)
- X11 is legacy; Wayland is present/future
- Wayland has different APIs for window, input, clipboard
- Many distros (Fedora, Ubuntu 22.04+, Arch) default to Wayland

## Proposed Solution

### 1. Wayland Client Protocol
Use `wlroots`-style protocol or raw Wayland client:
- Create `wl_display`, `wl_compositor`, `wl_subcompositor`
- Create `wl_surface`, attach `wl_buffer` from Vulkan/Metal? Actually need EGL or DRM.
- Use `wayland-scanner` to generate Zig bindings from `.xml` protocols

Simpler: Use SDL2 with Wayland backend.
- SDL2 abstracts Wayland/X11
- Use SDL2 for window/input/context creation
- Then Vulkan renderer on SDL2's `VkSurfaceKHR`

But we already have custom window code. Options:
- Write `window/wayland.zig` parallel to `window/darwin.zig`
- Reuse common renderer

### 2. Vulkan + Wayland
Wayland doesn't directly provide GPU context. Use:
- Vulkan with `VK_KHR_wayland_surface` extension
- Create `VkInstance`, `VkDevice`, `VkSurfaceKHR` from `wl_surface`
- Use DRM/GBM for direct rendering? Not needed if using Vulkan

Steps:
```zig
// After connecting to Wayland display
const wl_compositor = wl_registry_bind(registry, compositor_id, &wl_compositor_interface, 1);
const wl_surface = wl_compositor.create_surface(wl_compositor);

// Vulkan: create VkSurfaceKHR from wl_display + wl_surface
var surface: vk.SurfaceKHR = undefined;
vkCreateWaylandSurfaceKHR(instance, &(vk.WaylandSurfaceCreateInfoKHR){
    .platform = .wayland_khr,
    .wl = .{
        .display = wl_display,
        .surface = wl_surface,
    },
}, null, &surface);
```

Then regular Vulkan init.

### 3. Input Handling
Wayland `wl_keyboard`, `wl_pointer` interfaces:
- Keyboard: keycodes are Linux evdev codes (need mapping to ghostty Key)
- Pointer: mouse buttons, motion, scroll via scroll axis events
- Touch: optionally

Map Linux keycodes:
```zig
// Use linux_input.h constants: KEY_A=30, KEY_ENTER=28, etc.
// Match against ghostty.input.Key mapping
pub fn keyFromLinuxKeycode(keycode: u32) Key {
    return switch (keycode) {
        30 => .key_a,
        36 => .enter,
        // ... comprehensive map
        else => .unidentified,
    };
}
```

### 4. Clipboard (Wayland)
- `wl_data_device` for copy/paste
- Offer `"text/plain"` MIME type
- Read/write selections (primary vs clipboard)
- Primary selection: middle-click paste

Implementation:
```zig
// Copy to clipboard:
wl_data_device.set_selection(data_device, wl_data_offer, "CLIPBOARD");

// Paste request:
wl_data_device.get_selection(data_device, "CLIPBOARD");
// Event callback receives data, read stream
```

### 5. Resize Handling
Wayland surface configure events:
- `wl_surface::configure` → new width/height
- Should match Vulkan swapchain extent
- Also handle `wl_output` scale factor for HiDPI

### 6. Fullscreen
Wayland fullscreen: `wl_surface::set_fullscreen` with output
- Or use `xdg_toplevel` protocol (XDG shell, recommended over raw wl_shell)
- Send `xdg_toplevel::set_fullscreen`

### 7. Window Management
- Use `xdg_toplevel` for window decorations (client-side) vs server-side
- Most Wayland compositors use client-side decorations (CSD) with `xdg_toplevel`
- Or server-side (traditional) if compositor supports (KDE, GNOME fallback)

Our terminal doesn't need decorative title bar (use system's). So:
- Set `xdg_toplevel::set_app_id` to "gemra"
- Set title: `xdg_toplevel::set_title`
- Let compositor draw title bar (if any) or we use client decorations

Simple: don't draw title bar; just content. Compositor may provide minimal.

### 8. Build System Changes

In `build.zig` for Linux target:
```zig
const wayland_client = b.addSystemLibrary("wayland-client", .{
    .target = target,
    .optimize = optimize,
});
exe.linkLibrary(wayland_client);

const xkbcommon = b.addSystemLibrary("xkbcommon", .{...});
exe.linkLibrary(xkbcommon);
```

For Vulkan:
```zig
const vulkan = b.addSystemLibrary("vulkan", .{...});
exe.linkLibrary(vulkan);
```

### 9. Conditional Compilation

Use `std.builtin.target.os.tag`:
```zig
const builtin = @import("builtin");
const is_linux = builtin.target.os.tag == .linux;
const is_wayland = is_linux and std.os.getenv("WAYLAND_DISPLAY") != null;
```

Then:
```zig
const window_mod = if (is_linux and is_wayland)
    @import("window/wayland.zig")
else if (builtin.target.os.tag == .macos)
    @import("window/darwin.zig")
else
    @compileError("Unsupported platform");
```

### 10. Build Dependencies
- Wayland protocols: need `wayland-protocols` package for `xdg-shell`, `wl_data_device`
  - Usually installed system packages (`libwayland-dev`, `wayland-protocols`)
  - In `build.zig`: `b.systemModule(...)` to find `.xml` files
  - Run `wayland-scanner` to generate Zig interfaces (could pre-generate and commit)

Alternatively: Use `zwl` Zig library that already has bindings.

### 11. Input Method (IME)
Wayland has `wl_text_input` for complex input (CJK).
- Implement to support IME composition
- Pre-editing: show preedit string overlay
- Commit on Done

Complex, maybe later.

### 12. Security Model
Wayland enforces permissions:
- Clipboard access requires `wl_data_device` (implicitly granted to focused surface)
- Screenshot requires portal (xdg-desktop-portal)
- No need for our app to handle; compositor mediates

### 13. Testing
- Test on GNOME/Wayland (Fedora)
- Test on KDE/Wayland (KWin)
- Test on Sway (wayland compositor)
- Fallback to X11 if WAYLAND_DISPLAY not set

### 14. Configuration
```json
{
  "display": {
    "backend": "wayland",  // or "x11", "auto"
    "vulkan": {
      "use_x11_fallback": true
    }
  }
}
```

Auto-detection:
1. If `WAYLAND_DISPLAY` set → try Wayland
2. Else if `DISPLAY` set → X11
3. Else error

### 15. Performance
- Vulkan + Wayland should match Metal performance
- Less overhead than X11 (no X server)
- Better fullscreen (direct scanout possible)

### 16. Phased Rollout
1. Week 1: Vulkan renderer on X11 (still with darwin window module? need xlib)
2. Week 2-3: Wayland window module with raw wl_surface + Vulkan
3. Week 4: Clipboard, resize events, fullscreen
4. Week 5: Input method, IME
5. Week 6: Testing, polish

### 17. Team Skills Needed
- Vulkan experience
- Wayland protocol familiarity
- Linux graphics stack

### 18. Alternative: Just SDL2
One SDL2 backend for windows:
```zig
const window_mod = @import("window/sdl.zig");
```

SDL2 handles:
- Wayland/X11/Win32/Mac
- Input translation
- OpenGL/Vulkan context creation

Downside: dependency on SDL2 library (system or bundled). And less control over details.

But simpler: SDL2 for window+events, our Vulkan renderer only.

**Decision**: Use SDL2 for cross-platform windowing?
- Pros: single codebase for all platforms
- Cons: Extra dependency, possible performance overhead (minimal)
- SDL2 version requirement (2.0.18+ for Wayland Vulkan)

## Conclusion
Wayland support is critical for Linux. Implement after Metal backend stable. Prioritize Vulkan + Wayland. Consider SDL2 as alternative abstraction if Wayland direct proves too complex.

## References
- Wayland Client Documentation: https://wayland.freedesktop.org/docs/html/
- Vulkan Wayland Extension: https://www.khronos.org/registry/vulkan/specs/1.2-extensions/html/chap44.html
- wlroots example clients
- Sway source code (Wayland compositor for reference)
