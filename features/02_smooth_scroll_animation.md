# Feature 2: Smooth Scroll with Eased Animation

## Overview
Replace instant scroll jumps with smooth, eased scrolling animations that provide visual feedback and reduce motion sickness, while maintaining the terminal's instant responsiveness for keyboard-driven navigation.

## Problem
Traditional terminal emulators instantly jump the view when scrolling (PgUp/PgDn, mouse wheel). This abrupt motion feels jarring and provides no visual continuity. Terminal output scrolls instantly as lines are added to the buffer, creating a "jumpy" experience during rapid output.

## Proposed Solution

### 1. Physics-Based Animation System
- Implement a simple eased animation using交插 (sine/cubic easing)
- Animation parameters:
  - Duration: 150-200ms for keyboard-driven scrolls
  - Shorter (80-120ms) for mouse wheel scroll increments
  - Configurable easing curve (default: ease-out-cubic)
- Use a fixed timestep (1/60s) to advance animation state

### 2. Dual-Mode Scrolling
- **Instant scroll for large jumps**: Ctrl+Home/End, large scrollback jumps skip animation
- **Animated scroll for increments**: PgUp/PgDn, arrow keys + Shift, mouse wheel
- **Content-triggered scroll**: When output causes viewport to follow cursor, animate smoothly

### 3. Render-Time Offset
- Scroll offset is a float value animated over time
- In the vertex shader, apply scroll offset Y to all cell positions
- Sub-cell precision allows smooth pixel-level scrolling
- No need to rebuild vertex buffers during animation (just update uniform)

### 4. Input Handling During Animation
- Keyboard scroll commands queue and interrupt current animation
- New target offset cancels current animation and starts new one
- Maintains responsive feel while providing smooth motion

### 5. High-Frequency Scrolling
- For rapid mouse wheel events, extend current animation's target rather than restarting
- Creates fluid "flick" scrolling effect
- Configurable inertia/momentum after wheel input stops

## Implementation Details

#### Add to Renderer:
```zig
pub const ScrollState = struct {
    target_offset: f32,      // rows (can be fractional)
    current_offset: f32,     // current animated position
    animation_time: f32,     // 0 to 1 progress
    animating: bool,
    start_offset: f32,
    easing: EasingFunction,
};

pub fn updateScrollAnimation(self: *ScrollState, delta_time: f32) void {
    if (!self.animating) return;

    self.animation_time += delta_time / self.duration;
    if (self.animation_time >= 1.0) {
        self.animation_time = 1.0;
        self.animating = false;
    }

    const t = self.easing.ease(self.animation_time);
    self.current_offset = self.start_offset +
        (self.target_offset - self.start_offset) * t;
}
```

#### Modify Vertex Shader:
Add scroll offset uniform that shifts Y coordinate of all cells before rasterization.

#### Terminal Integration:
- Terminal scroll position is now a float, not integer rows
- Convert to integer for cell selection but keep fractional for rendering
- Pre-buffer 1-2 extra rows above/below to render partial scroll positions smoothly

## Benefits
- **Professional UX**: Matches modern smooth-scrolling applications
- **Motion Comfort**: Reduces eye strain from sudden jumps
- **Context Preservation**: Smooth motion helps maintain visual reference point
- **Aesthetic**: Feels more polished and "native" to macOS

## Configuration
Expose in settings:
```zig
scroll {
    animation_duration = 180  # ms
    easing = "ease-out-cubic" # or linear, ease-in-out
    momentum = true           # inertia after wheel scroll
    instant_threshold = 10    # rows - skip animation for large jumps
}
```

## Platform Considerations
- On Retina displays, use pixel-perfect animation (not tied to cell multiples)
- Respect "Reduce Motion" accessibility setting (add config option to disable)

## Zig Advantages
- Easy to implement animation state machine with Zig's exhaustive switch
- Compile-time ease function selection (no runtime overhead of function pointers)
- Efficient float operations and vector math with Zig's std.math
