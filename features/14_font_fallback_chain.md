# Feature 14: Configurable Font Fallback Chain

## Overview
Implement a multi-font fallback system so that when the primary font lacks a glyph (emoji, CJK, rare symbols), the terminal automatically searches secondary fonts and renders the glyph correctly, eliminating tofu (□) boxes and improving international support.

## Problem
Current single-font approach:
- Primary font (e.g., Hack, Fira Code) lacks many Unicode blocks
- Missing glyphs display as tofu (□) or blank
- User must change font to see emoji/CJK (losing programming font benefits)
- Different fonts have different metrics → layout issues if switched entirely

## Proposed Solution

### 1. Font Stack Configuration
User provides ordered list of fonts:
```json
{
  "font": {
    "primary": "Fira Code",
    "fallback": [
      "SF Mono",           // Apple monospace, has some missing glyphs
      "Menlo",             // Wide coverage
      "Apple Color Emoji", // Emoji & symbols
      "Noto Sans CJK JP",  // Japanese/Chinese/Korean
      "DejaVu Sans Mono"   // Extended Latin, Greek, Cyrillic
    ],
    "size": 14.0
  }
}
```

### 2. Fallback Algorithm
When rendering cell with codepoint `cp`:
1. Try `primary_font.getGlyph(cp)`
2. If `.missing`, iterate `fallback[]` fonts in order:
   - `fallback_font.getGlyph(cp)`
   - Return first found
3. If all missing → default tofu glyph (or skip rendering)

**Per-cell font variant**:
- If cell style is bold/italic, try bold/italic variant in fallback fonts
- If variant missing, use regular variant

### 3. Atlas Texture Layout
Current: single atlas for primary font only

New: multi-font atlas:
- Reserve separate texture regions per font (or share same atlas)
- All fonts must be same pixel size (unified cell height)
- Atlas coordinates include font index

**Atlas management**:
```zig
const FontAtlas = struct {
    fonts: []FontEntry,
    allocator: std.mem.Allocator,

    pub fn init(allocator: std.mem.Allocator, fonts: []const []const u8, size: f32) !FontAtlas {
        var entries = try allocator.alloc(FontEntry, fonts.len);
        for (fonts, 0..) |font_name, i| {
            entries[i] = try loadFont(allocator, font_name, size);
        }
        return FontAtlas{ .fonts = entries, .allocator = allocator };
    }

    pub fn getGlyph(self: *FontAtlas, cp: u21, variant: FontVariant) Glyph {
        // Search through fonts in order
        for (self.fonts) |*font| {
            if (font.hasGlyph(cp, variant)) {
                return font.getGlyph(cp, variant);
            }
        }
        return self.fonts[0].getMissingGlyph(); // Tofu
    }
};
```

### 4. Metrics Compatibility
**Issue**: Different fonts have different:
- Glyph advance widths (monospace assumption may break)
- Baseline offsets
- Ascender/descender ratios

**Solutions**:
- **Normalize metrics**: All fonts scaled to match primary font's cell width/height
  - Compute average/max advance of primary font
  - Scale fallback font glyphs to match (bitmap scaling loses quality)
  - Better: request exact cell-compatible fonts; fallback only if metrics match

- **Font config validation**: At startup, validate all fonts in stack have compatible metrics
  - Compare `units_per_EM`, `advance_width` of 'M' and space
  - Warn if mismatched (user to fix)

- **Stretch/shrink**: Use CoreText to draw fallback glyph with exact size targets (transform matrix)
  ```zig
  CTFontCreateWithFontDescriptor(desc, size, &transform_matrix)
  ```

### 5. Performance
- Multiple font rasterizations increase atlas population time (startup)
- Runtime: `getGlyph` searches linearly (O(n) where n=font count, typically 3-5)
  - Fast: cache miss only on first appearance of glyph from fallback font
- Memory: each font adds atlas texture (2048² × 4 bytes RGBA = 16MB per font at worst)
  - Many fonts may exceed GPU memory → limit fallback chain to 3-5 fonts

### 6. Configuration Options
```zig
font {
    primary = "Fira Code"
    fallback = ["Apple Color Emoji", "Noto Sans CJK JP"]
    size = 14.0
    fallback_max_distance = 3  # Max fonts to search (avoid slow fallback chains)
    metrics_strict = true      # Reject fonts with incompatible metrics
    fallback_on_missing = true # Disable to use tofu
}
```

### 7. Font Discovery
At startup:
1. Load primary font from config
2. For each fallback font:
   - Resolve via FontConfig/CoreText
   - Verify exists and is monospace (if `metrics_strict`)
   - Pre-load into atlas if possible
3. If font not found: skip or error (configurable: `strict=false` → warn & skip)

### 8. Atlas Population
On-demand:
- Glyphs requested as cells rendered
- For fallback fonts, populate atlas texture region lazily
- May cause frame hitch on first glyph from fallback font (rasterization)

**Mitigation**:
- Pre-populate common fallback glyphs (emoji ranges, CJK common) at startup
- Background thread for fallback glyph rasterization (while foreground renders)
- Display "loading" placeholder or wait briefly

### 9. Complex Scenario: Mixed Variants
Cell requires bold glyph:
1. Primary font bold ✓ → use that
2. Primary bold missing, fallback 1 regular only → try fallback 1 bold?
   - Option A: accept regular (weight mismatch)
   - Option B: continue to next font with bold variant
   - Config: `fallback_strict_variants = false` → accept regular

### 10. Emoji Color Fonts
Apple Color Emoji is color bitmap font (Apple SBIX format):
- CoreText renders as RGBA bitmap with color
- Atlas needs RGBA texture (already have)
- No need to convert to grayscale
- May have larger advance than monospace → display offset?

**Solution**:
- Render emoji at cell center (not left-aligned)
- Accept slight width mismatch; emoji typically square

### 11. Testing
- [ ] Set primary=Hack, fallback=Apple Color Emoji
- [ ] Render 😀, 你好, привет, α β γ → correctly from fallback
- [ ] Verify metrics alignment (fallback glyph vertically centered)
- [ ] Bold/italic CJK: if primary lacks bold CJK, fall back to bold variant
- [ ] Missing glyph still missing after all fallbacks → tofu
- [ ] Long fallback chain (5 fonts) → performance acceptable

### 12. Management Commands
CLI to manage font stack:
- `gemra --list-fonts` → show available monospace fonts
- `gemra --test-font <name>` → render test pattern (all Unicode blocks)
- Config validation: `gemra --check-fonts` → report missing/incompatible fonts

### 13. Future Extensions
- **Font subsetting**: Only include used glyphs in atlas per font (reduce memory)
- **Per-profile font stack**: Different stacks for coding, docs, SSH sessions
- **Unicode block mapping**: Prefer specific fonts per block (emoji → color emoji font, CJK → Noto CJK)
- **Dynamic fallback**: Learn which fallback fonts used and prioritize them

## References
- FreeType font fallback (FcFontSort, FcFontSet)
- Pango's font map architecture
- WezTerm's font fallback implementation
- harfbuzz's `hb_font_create` with fallback

## Implementation Order
1. Basic fallback chain (2-3 fonts) with metric validation
2. Atlas management for multiple fonts
3. Pre-population of common glyphs
4. Advanced variant matching and configuration
