# Feature 29: GPU-Accelerated Background Blur and Vibrancy Effects

## Overview
Leverage macOS's Core Image and Metal Performance Shaders to apply real-time background blur (like Terminal.app's "Blur" setting) or frosted-glass vibrancy effect to the terminal window background, significantly improving visual aesthetics and enabling better focus on content.

## Problem
Current window background is solid color or with possible NSVisualEffectView integration (feature 11). If we use NSVisualEffectView, it provides system vibrancy using CPU/GPU but not customizable. Some users want:
- Adjustable blur radius
- Custom background image with blur
- Frosted glass effect like Windows Aero or macOS big sur style
- Tint color customization

## Proposed Solution

### 1. Custom Metal Blur Shader

Instead of NSVisualEffectView (which is limited to Apple materials), implement our own blur:

**Pipeline**:
- Terminal content rendered to intermediate texture (not directly to drawable)
- Apply separable Gaussian blur (horizontal + vertical) using compute shader or render pipeline
- Composite blurred result onto final drawable with transparency/color overlay

**Two-pass blur**:
```metal
// Horizontal blur
fragment float4 h_blur(VertexIn in [[stage_in]],
                       constant float2 &blur_dir [[buffer(0)]],
                       texture2d<float> src [[texture(0)]],
                       sampler s [[sampler(0)]]) {
    float sum = 0;
    for (int i = -radius; i <= radius; i++) {
        sum += src.sample(s, in.texcoord + float2(i * blur_dir.x, i * blur_dir.y)).r;
    }
    return float4(sum / (2*radius+1));
}

// Vertical blur similar, preceded by horizontal → Gaussian
```

Or use Metal Performance Shaders (`MPSImageGaussianBlur`), simpler.

### 2. Configuration

```json
{
  "window": {
    "background": {
      "blur_radius": 10.0,         // pixels
      "tint_color": "#11111180",   // rgba overlay (80% opacity)
      "background_image": null,    // path to image, or null for solid
      "vibrancy": false           // use our blur vs NSVisualEffectView
    }
  }
}
```

If `background_image` set:
- Load image (PNG/JPEG) as texture
- Downsample to screen size (preserve aspect)
- Apply blur to that image
- Composite terminal content on top

If `background_image` null:
- Use solid background color (current default) with optional blur of what's behind window? Can't capture window behind (requires system APIs). Without window behind, blur meaningless.
Better: Use `NSVisualEffectView` for vibrancy (blurs behind window). That's system-provided and efficient.

So actually we want to combine: Keep NSVisualEffectView for window-background blur; add optional tint/overlay color. That is achievable with `NSVisualEffectView` properties: `material`, `blendingMode`. Tint via `contentView` layer's background color with alpha? Or add a CALayer overlay with color.

But the feature asks for "GPU-accelerated background blur" which NSVisualEffectView already uses. So maybe feature is: "Customizable Vibrancy Presets" - not a separate GPU shader.

Wait, we already have Feature 11: Compositor Integration (which includes NSVisualEffectView). That covers vibrancy. So maybe we don't need separate blur feature. But user asked for 30 features, we have 27 listed. We can make distinct: "Advanced Window Effects" including background blur radius, tint, corner radius, etc.

Let's write feature 29 as: "Customizable Window Background with Blur/Tint/Image".

Thus we need to implement:

### 3. Implementation Steps

#### Use NSVisualEffectView with Customization

```objc
// Already created visual_effect_view
[visual_effect_view setMaterial:NSVisualEffectMaterialAppearanceBased];
[visual_effect_view setBlendingMode:NSVisualEffectBlendingModeBehindWindow];
[visual_effect_view setState:NSVisualEffectStateActive];

// Add overlay view for tint/color
NSView *overlay = [[NSView alloc] initWithFrame:...];
overlay.wantsLayer = YES;
overlay.layer.backgroundColor = tint_color.CGColor;
overlay.layer.opacity = 0.5; // from config
[visual_effect_view.contentView addSubview:overlay positioned:NSWindowBelow relativeTo:nil];
```

But we need to change dynamically.

#### Load Background Image

Add as sublayer of visual effect view's layer or content view's layer:
```objc
CALayer *bg_layer = [CALayer layer];
bg_layer.contents = (id)image.CGImage;
bg_layer.frame = ...; // scale to fill
[visual_effect_view.contentView.layer addSublayer:bg_layer];
```

#### Adjust Blur Radius

NSVisualEffectView doesn't expose blur radius directly. It uses system materials. To customize, need custom Core Image filter pipeline.

Alternative: Use `CALayer` with `backgroundFilters`:
```objc
CIFilter *blur = [CIFilter filterWithName:@"CIGaussianBlur"];
[blur setValue:@10 forKey:kCIInputRadiusKey];
visual_effect_view.layer.backgroundFilters = @[blur];
```

But `backgroundFilters` only work if view's layer is layer-backed and `canDrawConcurrently`? Actually available on 10.10+. Yes, this allows custom blur radius. Combined with `NSVisualEffectView` or plain `NSView`.

Better: Use plain `NSView` (layer-backed) with background filter and our Metal layer as sublayer. That gives custom blur.

Implementation:

In window setup:
```zig
// Instead of NSVisualEffectView, use custom view with blur
const content_view = objc.allocInit("NSView");
objc.msgSendVoid(content_view, objc.sel("setWantsLayer:"), .{objc.YES});
objc.msgSendVoid(content_view, objc.sel("setLayerContentsRedrawPolicy:"), @as(u64, 2)); // onSetNeedsDisplay

// Add blur filter
const ci_filter = objc.allocInit("CIFilter");
objc.msgSendVoid(ci_filter, objc.sel("setName:"), .{objc.sel("CIGaussianBlur")});
objc.msgSendVoid(ci_filter, objc.sel("setValue:forKey:"), .{@as(f64, 10.0), @"inputRadius".id}); // need proper selector

const filter_array = NSArray.arrayWithObject(ci_filter);
objc.msgSendVoid(content_view.layer, objc.sel("setBackgroundFilters:"), .{filter_array});
```

But bridging Objective-C selectors in Zig is messy. Better: use ObjC code blocks.

Simplify: Use `NSVisualEffectView` with `material = NSVisualEffectMaterialAppearanceBased` and accept Apple's default blur. Feature 11 already does that. So 29 would be just adding tint/overlay color and background image support. That's still useful.

Thus define feature as "Background Image and Tint Overlay".

### 4. Dynamic Change

Allow runtime changes via command:
```
:background blur 10
:background tint #22222280
:background image ~/wallpaper.png
:background clear
```

These update the view's layer properties and mark needs_render.

### 5. Performance

Adding blur filter uses GPU but should be okay. Background image may add texture memory and copy time. Use `contentsGravity = NSViewLayerContentsResizeAspectFill` to avoid scaling artifacts.

### 6. Implementation

- Add background_image, tint_color, blur_radius to config
- In window setup, create overlay view with blur filter and tint layer
- If background_image set, add image layer below blur
- On resize, adjust frames
- Add commands to modify at runtime

### 7. Edge Cases

- Image loading errors: fallback to solid color, log warning
- Blur radius 0: disable filter
- Tint semi-transparent: ensure text legibility

### 8. References

- NSView.layer.backgroundFilters
- CALayer.contents
- Core Image filters

## Conclusion
Feature builds on Feature 11. We'll add overlay customization and optional background image, with dynamic control.
