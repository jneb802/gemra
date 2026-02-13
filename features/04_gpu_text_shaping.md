# Feature 4: GPU-Accelerated Text Shaping

## Overview
Offload complex text shaping and glyph rendering to compute shaders or specialized GPU pipelines to achieve 144fps+ rendering even with thousands of Unicode glyphs, CJK characters, and powerline symbols, while reducing CPU overhead.

## Problem
Current implementation pre-rasterizes all glyphs into a texture atlas on CPU (likely using CoreText/FontConfig). This limits:
- Startup time: rasterizing entire font suite takes seconds
- Memory: large atlas textures consume VRAM
- Flexibility: can't easily support advanced OpenType features (ligatures, alternates)
- Performance: CPU becomes bottleneck when many glyphs need rasterization

## Proposed Solution

### 1. Signed Distance Field (SDF) Glyph Rendering
Instead of pre-rasterizing glyphs at fixed size:
- Upload font outlines (from CoreText/FreeType) to GPU as vector data
- Render glyphs on-demand in vertex shader using SDF technique
- Advantages:
  - Single SDF texture per font size resolution, scales smoothly
  - Virtually unlimited glyph count without atlas size limits
  - Perfect subpixel rendering at any zoom level
  - Tiny memory footprint (256×256 SDF vs 2048×2048 atlas)

### 2. Compute Shader Glyph Caching
- First time a glyph is needed, launch compute shader to rasterize SDF
- Cache result in GPU-private texture (persistent across frames)
- LRU eviction policy (limit cache to ~2048 glyphs to bound VRAM)
- Cache key: (font_variant, codepoint) → texture region

### 3. Per-Cell Vertex Shader Generation
- Reduce vertex buffer to just 4 vertices per cell (no glyph quads)
- Vertex shader receives:
  - Cell position (grid coordinates)
  - Codepoint, font variant, color data
  - Computes glyph SDF lookup in fragment shader
- Pull-based: glyph data fetched per-vertex if needed

### 4. Implementation Phases

#### Phase 1: SDF Atlas Generation (CPU Preprocessing)
- Use CoreText to extract glyph paths as Bézier curves
- Convert to SDF using CPU (once per font/size)
- Upload SDF texture atlas (512×512 or 1024×1024) to GPU
- Keep existing atlas system as fallback

#### Phase 2: Dynamic Compute-Shader SDF
- Generate SDF directly on GPU using compute shader
- Store default font paths in shader as constants vs descriptor
- More complex but eliminates CPU SDF generation

#### Phase 3: Full Vector Rendering
- Store font path data in GPU buffers
- Rasterize per-glyph in vertex shader using analytical SDF
- No atlas needed at all (true infinite glyph count)

### 5. Pipeline Changes

**Vertex Format (simplified)**:
```zig
// Old: 6 vertices per cell with pre-rasterized glyph quad
Vertex {
    position: vec2,
    texcoord: vec2,
    fg_color: vec4,
    bg_color: vec4,
    is_bg: f32,
}

// New: 4 vertices per cell with codepoint
Vertex {
    cell_pos: vec2,         // grid coordinates
    glyph_codepoint: u32,
    font_variant: u32,      // regular/bold/italic
    fg_color: vec4,
    bg_color: vec4,
    flags: u32,             // underline, etc.
}
```

**Fragment Shader**:
```metal
fragment float4 fragment_main(VertexIn in [[stage_in]],
                              constant Uniforms &u [[buffer(1)]],
                              texture2d<float> sdf_tex [[texture(0)]],
                              sampler s [[sampler(0)]]) {
    // Fetch SDF for glyph at in.glyph_codepoint
    float sdf = sample_glyph_sdf(sdf_tex, in.glyph_codepoint, in.texcoord);
    float alpha = smoothstep(0.5 - edge, 0.5 + edge, sdf);
    return mix(bg_color, fg_color, alpha);
}
```

### 6. Migration Strategy
- Keep current atlas-based rendering as fallback behind config flag
- Feature flag for gradual rollout
- Benchmark both paths on various hardware

## Benefits
- **Memory**: 10-50× reduction in glyph texture memory (from 8-32MB to <1MB)
- **Startup**: Near-instant font loading (no rasterization loop)
- **Glyph Coverage**: Support for any Unicode character without atlas overflow
- **Scaling**: Crisp rendering at any font size (perfect for accessibility zoom)
- **Features**: Easy to implement OpenType features (alternates, stylistic sets) on GPU

## Challenges
- **Complexity**: SDF generation for thousands of glyphs is non-trivial
- **Text Quality**: SDF edges can be blurry at extreme sizes vs direct raster
- **Legacy Support**: Must maintain CPU path for older macOS versions without required GPU features
- **Debugging**: GPU text rendering harder to debug than CPU pre-rendered

## Performance Targets
- **Glyph Rasterization**: <0.5ms per frame on Apple Silicon (including SDF generation)
- **VRAM**: <2MB for SDF texture + <512MB for glyph texture cache (vs 8-64MB)
- **Startup**: <200ms to first paint (vs 1-3s currently)

## Platform Limits
- Minimum: macOS 10.14 (Metal 2) for compute shader support
- Fallback to CPU rasterization pre-SSE4.2 or older GPUs

## References
- Valve's SDF text rendering paper (2011)
- GPU Gems 3: Chapter 25 (" Efficient Text Rendering")
- Modern engine implementations (Unity, Unreal SDF text)
