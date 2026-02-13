# Feature 11: macOS Compositor Integration (Window Effects)

## Overview
Leverage macOS Core Animation layer-backed window features to add modern visual polish: translucent/blurred backgrounds, vibrancy, smooth window animations, and native macOS window management integration.

## Problem
Current window is a basic NSWindow with solid background. Doesn't match modern macOS aesthetic:
- No vibrancy/blur (like Terminal.app, iTerm2)
- Window resizing/dragging feels basic
- No title bar integration (traffic lights only)
- Full-screen transitions basic (no animation)
- No window tabbing (macOS 10.12+)

## Proposed Solution

### 1. Vibrancy and Material
Replace `CAMetalLayer` contents with `NSVisualEffectView`:
```objc
NSVisualEffectView *vibrancy = [[NSVisualEffectView alloc] init];
[vibrancy setMaterial:NSVisualEffectMaterialAppearanceBased]; // or Dark, Light, etc.
[vibrancy setBlendingMode:NSVisualEffectBlendingModeBehindWindow];
[vibrancy setState:NSVisualEffectStateActive];

// Metal layer as sublayer of vibrancy's layer
[vibrancy.layer addSublayer:metalLayer];
```

**Alternative**: Use `CALayer` with `background Filters`:
```objc
layer.backgroundFilters = @[
    [CIFilter filterWithName:@"CIGaussianBlur" keysAndValues:
        kCIInputRadiusKey, @8.0, nil]
];
```

But `NSVisualEffectView` is the proper macOS API.

### 2. Window Appearance

#### Fullscreen Transitions
- Use `NSWindowCollectionBehaviorFullScreenPrimary`
- Animated zoom effect into full screen (default macOS)
- Custom transition options:
  - Fade
  - Slide (left/right)
  - Scale-up

#### Traffic Light Buttons
- Keep standard macOS window controls
- Optional: hide when inactive, show on hover (like Terminal.app)
- Add close/zoom/minimize behavior to match platform idioms

#### Title Bar Integration
- Use `titleVisibility = NSWindowTitleHidden`
- Use `titlebarAppearsTransparent = YES`
- Allow content to extend into title bar area (for custom tab bar, search)
- Touch Bar support (if hardware present)

### 3. Window Shadows
- Enable standard window shadow (automatically drawn)
- Customize shadow properties:
  - `shadowOpacity`
  - `shadowRadius`
  - `shadowOffset`

### 4. Tabbing (macOS Sierra+)
Enable unified tabbing:
```objc
[window setTabbingMode:NSWindowTabbingModePreferred]; // or allowed, disallowed
```
- `Cmd+Shift+\\` → merge all gemra windows into single window with tabs
- `Cmd+Option+\\` → move tab to new window
- System tab bar appears (or custom)
- Tab switching: `Ctrl+Tab` / `Ctrl+Shift+Tab`

**Implementation**:
- Each tab = separate terminal session + PTY + renderer
- Window manager handles tab bar UI (system-provided)
- Our app supplies tab titles from terminal title
- When tab selected, swap active terminal context

### 5. Animated Resizing
- Smooth window resize with content flowing
- Use `NSWindow`'s `setFrame:display:animate:` for animated resize
- Implement `viewDidEndLiveResize` to handle buffer realloc after user finishes drag
- During live resize: show intermediate size (may be pixelated, OK)

### 6. Adaptive Toolbar (Optional)
- Add toolbar with buttons (new tab, split pane, settings)
- Show/hide with `Cmd+Option+T` or context menu
- Toolbar items: NSToolbarItem with custom view or action

### 7. Mission Control & Spaces
Window behaves correctly in:
- Mission Control (zoomed preview)
- Space switching (smooth animation)
- App Exposé (`App+Tab`)

Just use standard `NSWindow` APIs, automatically handled.

### 8. Dark/Light Mode
Follow system appearance:
```objc
[window setAppearance:[NSAppearance appearanceNamed:NSAppearanceNameVibrantDark]];
```
- React to `NSApplication.didChangeEffectiveAppearanceNotification`
- Update renderer colors (palette) accordingly
- Smooth crossfade transition (0.3s) if desired

### 9. Transparency & Opacity
Allow user config:
- Window opacity: 100% (default) down to 70%
- Useful for overlaying on docs/windows
- Respects vibrancy (semi-transparent looks different)

Via: `window.opacity = 0.85`

### 10. Window Restoration
Save/restore window position, size, tab state:
- `NSWindow.restorable` property
- Implement state restoration methods
- Save windows' frames to `NSUserDefaults`/plist

### 11. Accessibility Integration
- NSAccessibility protocols
- VoiceOver support for terminal content? (Difficult, but basic)
- Accessibility inspector sees window as standard

### 12. Touch Bar Integration (if relevant)
- Show current path, command, or search field
- Custom Touch Bar view updates dynamically

### 13. Implementation Steps

1. **Swap view hierarchy**
   Current: `NSWindow.contentView = GemraView (layer-backed)`
   New: `NSWindow.contentView = NSVisualEffectView` → `GemraView` as subview

2. **Adjust Metal layer**
   - Set `metalLayer.contentsScale` to match backing scale
   - Ensure Metal layer doesn't draw over vibrancy (blending)

3. **Handle appearance changes**
   - Observe `NSApplication.effectiveAppearance`
   - Re-render with new color palette

4. **Add window restoration**
   - Implement `NSWindowRestoration` protocol (optional)

5. **Test full-screen, split view, tabbing**

### 14. Code Changes
In `window.zig`:

```zig
// Instead of creating CAMetalLayer directly...
const visual_effect_view = objc.allocInit("NSVisualEffectView");
objc.msgSendVoid(visual_effect_view, objc.sel("setMaterial:"), @as(u64, 15)); // NSVisualEffectMaterialAppearanceBased
objc.msgSendVoid(visual_effect_view, objc.sel("setBlendingMode:"), @as(u64, 1)); // BehindWindow
objc.msgSendVoid(visual_effect_view, objc.sel("setState:"), @as(u64, 1)); // Active

const view = objc.msgSend(objc.id, objc.alloc(view_cls), objc.sel("initWithFrame:"), .{frame});
objc.msgSendVoid(visual_effect_view, objc.sel("addSubview:"), .{view});
objc.msgSendVoid(win, objc.sel("setContentView:"), .{visual_effect_view});

// Also configure window for full-screen, tabbing
objc.msgSendVoid(win, objc.sel("setCollectionBehavior:"), @as(u64, 0x7)); // fullScreenPrimary | fullScreenAuxiliary | moveToActiveSpace
objc.msgSendVoid(win, objc.sel("setTabbingMode:"), @as(u64, 1)); // NSWindowTabbingModePreferred
```

### 15. Trade-offs
- **Performance**: Vibrancy adds GPU cost (blur pass) ~1-2ms/frame
- **Aesthetics**: Some users prefer solid background for readability
- **Complexity**: More view hierarchy, potential layering bugs

### 16. Feature Flag
`window.vibrancy = true` in config, default false for now (test stability first)

## References
- Apple docs: NSVisualEffectView
- Apple Human Interface Guidelines: Vibrancy
- Terminal.app implementation (default Terminal uses vibrancy)
- iTerm2 window effects
