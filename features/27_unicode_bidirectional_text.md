# Feature 27: Unicode Bidirectional Text and Complex Script Support

## Overview
Add full Unicode text rendering with bidirectional algorithm (UAX #9) and complex script shaping (Arabic, Hebrew, Hindi, Thai, etc.) support to ensure correct display of mixed LTR/RTL text and Indic/SE Asian scripts, important for international users and multilingual documentation.

## Problem
Current rendering assumes simple left-to-right, character-per-cell:
- RTL text (Arabic, Hebrew) displays backwards (mirrored glyph order)
- Complex scripts with ligatures/stacking (Devanagari, Thai, Myanmar) don't connect properly
- Combining marks may appear detached
- Bidirectional mixing (English+Arabic in same string) incorrect

This prevents using terminal for multilingual work, chat, coding in RTL languages.

## Proposed Solution

### 1. Text Shaping Engine
Use an existing shaping engine:
- **HarfBuzz** via `harfbuzz-zig` bindings (recommended)
- **CoreText** on macOS already does shaping but we bypass it with custom rasterizer
- **Uniscribe** on Windows (not our target)
- FreeType + HarfBuzz combination (libre)

Add dependency: `harfbuzz` and `freetype2` (for font face loading, though we use CoreText on macOS). Wait, on macOS we already use CoreText to get glyphs via `CTFontGetGlyphsForCharacters` and `CTFontCreatePathForGlyph`. That's not shaping - it's one-to-one mapping.

For shaping, need to feed HarfBuzz buffer:
```zig
const hb_buffer_t = *opaque {};
var buffer = hb.hb_buffer_create();
defer hb.hb_buffer_destroy(buffer);

hb.hb_buffer_add_utf32(buffer, codepoints, len, 0, len);
hb.hb_buffer_set_direction(buffer, HB_DIRECTION_LTR); // or RTL based on first strong char
hb.hb_buffer_set_script(buffer, HB_SCRIPT_ARABIC); // need script tag from Unicode
hb.hb_buffer_set_language(buffer, hb.hb_language_from_string("ar", -1));

hb.hb_shape(font_face, buffer, &features, 1);
// Then get glyph info/positions
```

### 2. Bidirectional Algorithm
Need UAX #9 implementation. Options:
- Use HarfBuzz's built-in bidi resolver: `hb.hb_buffer_set_flags(buffer, HB_BUFFER_FLAG_BIDI)` then hb_shape does bidi reordering? Actually HarfBuzz expects text in logical order; we need to run Bidi before shaping? There's `hb.hb_buffer_set_content_type` and `HB_BUFFER_CONTENT_TYPE_UNICODE`. Better to use FriBidi (C library) or Zig implementation.

Search: `<https://github.com/RealityNet/zig-fribidi>`? Might not exist.

Simpler: use ICU's `ubidi`? Heavy dependency.

Could use pure Zig bidi implementation:
- UAX #9 algorithm is documented; implement in Zig (moderate complexity ~500 LOC)
- Then feed reordered logical→visual clusters to HarfBuzz

But bidi interacts with shaping: need to resolve embedding levels, then shape each directional run separately.

Alternatively: let HarfBuzz handle both bidi and shaping if we set the correct flags. According to HarfBuzz docs: if you set `HB_BUFFER_FLAG_BIDI`, HarfBuzz will run Bidi algorithm? Actually `hb_buffer_set_direction` sets overall direction; for mixed text, HarfBuzz can do automatic `HB_DIRECTION_INVALID` to detect? Let's check:

From HarfBuzz guide: "If you are unsure of the direction, set to `HB_DIRECTION_INVALID`, HarfBuzz will try to deduce using Unicode Bidi algorithm." Good! So:
```zig
hb.hb_buffer_set_direction(buffer, HB_DIRECTION_INVALID); // auto-detect
hb.hb_buffer_set_script(buffer, HB_SCRIPT_COMMON); // or default
hb.shape(...); // Will produce visual glyph order with positions
```

Result: glyphs already in visual order with x-advance. We need to render as sequence of glyphs with positions.

### 3. From Shaped Glyphs to Terminal Cells

Terminal grid is fixed-width cell layout. But shaping produces variable advances (some glyphs wider, some clusters). How to map?

For a terminal cell width of fixed `cell_width`:
- HarfBuzz gives glyph x-advance (in font units)
- We need to fit glyphs into cell columns (each cell is N pixels wide)
- Complex: Indic scripts may have multiple glyphs per cluster, but they still occupy one logical cell width? Actually Devanagari: consonant conjunct forms a single cluster but may be wide. It should fit within cell width; if too wide, truncate? Usually monospace fonts include these glyphs with advance equal to cell width, or they're designed for monospace.

But with font fallback, we may get proportional fonts.

Strategy:
- Use monospace fonts exclusively for terminal (fallback fonts also monospace with matching metrics)
- HarfBuzz shaping within monospace should produce glyphs that advance exactly one cell or multiples (for wide chars).
- For ligatures: e.g., `->` as single glyph; advance might be 2 cells width. So our cell grid must accommodate wide cells (`Cell.wide` field).
- Already supported: ghostty has `Cell.wide` (spacer_head/tail). So shaping can consume multiple logical cells.

**Workflow**:
1. Get row of terminal cells (each has codepoint(s) and style)
2. Group contiguous cells with same style (run)
3. For each run:
   - Collect codepoints (including wide markers)
   - Create HarfBuzz buffer
   - Shape
   - Get glyphs: may output N glyphs for M codepoints
   - Compute total advance (in font units) -> map to cell widths
   - Assign resulting glyphs to cells, handling wide cells (spacer_tail)
4. If a glyph extends beyond allocated cell width (e.g., too wide), either:
   - Clip to cell (bad)
   - Allow overflow to next cell (like double-width - need to mark next cell as `.spacer_tail`)
   - Best: ensure monospace font has appropriate metrics; fallback fonts same width.

But terminal grid already has cell width determined by font atlas. So shaping must produce glyphs with advances that fit within that cell width. We'll pre-scale font to match cell width exactly, and expect shaping to produce glyphs that fit (monospace assumption). For ligatures that span two characters, HarfBuzz may produce a single glyph with advance = 2 × em_width. That's perfect: we render that glyph covering two cells (like we already do for wide chars). So we need to map shaped glyphs back to cell grid positions: if glyph.advance corresponds to 2 cells, we mark first cell as `wide_head` and second as `spacer_tail`. This is exactly what we need.

Implementation:
- After shaping, iterate glyphs:
  - Each glyph has `hb_glyph_info_t` with codepoint indices actually encoded. The cluster info tells which original codepoint(s) it corresponds to.
  - For terminal cell grid, we need to map original cell indices to output glyphs (one or more cells per glyph).
  - Use cluster mapping from HarfBuzz: `hb.hb_glyph_info(cluster)` gives cluster index into original buffer (index of first codepoint). The cluster may span multiple codepoints.
  - We can reconstruct: for each cluster, mark those original cells as part of same glyph. For rendering, we assign the glyph to the first cell, and for subsequent cells mark `.spacer_tail`.

But we need to know cell widths: some codepoints are East Asian Wide (W) or Fullwidth (F). Ghostty's vt stream already classifies cells as wide (double-cell). That information is in the cell's `wide` field. So we already know which cells are single or double width. After shaping, we might need to adjust if the font's glyph for a wide char actually has advance = cell_width*2? That should happen automatically if font has proper metrics.

### 4. Atlas Integration with Shaping

Currently `Atlas.getGlyph(cp, variant)` returns glyph rectangle for a single codepoint. With shaping, we need to handle sequences:
- For each glyph cluster, generate texture coordinates for that glyph (from Normal atlas? Or need separate texture for shaped glyphs? But we can still use same atlas; the glyphs are already in font. The shaped glyph is just a glyph ID that already exists in the atlas if we've added it.

Problem: Atlas currently is populated by scanning through codepoints and loading them individually on demand. With clusters, we might need to pre-populate atlas with glyphs for sequences? No: HarfBuzz returns glyph ID(s) that correspond to individual glyphs in the font (including ligature glyphs). Those glyph IDs are from the font's glyph table. Our atlas currently maps (codepoint, variant) → texture region. But shaped glyphs may be ligature glyphs that don't have a direct codepoint mapping. How to handle?

Option A: Pre-populate atlas with all glyphs that HarfBuzz might return. But we don't know all cluster combinations.

Option B: Add fallback: For any glyph ID returned by HarfBuzz, we need to rasterize that glyph ID from the font (not from codepoint). So Atlas needs method: `getGlyphById(glyph_id, font_variant)`. We'll need to rasterize arbitrary glyph IDs on demand, store them in atlas with key based on glyph ID and variant.

But we also need to differentiate between codepoint→glyph mapping (for single codepoints) and cluster→glyph mapping.

Simpler: Keep existing atlas for simple (cached) glyphs. For shaped clusters, we rasterize glyphs as needed and store them in separate "glyph cache" keyed by `(font, glyph_id)` not codepoint.

Actually existing atlas: `Atlas` loads glyphs from CoreText using `CTFontGetGlyphForCharacter` and then `CTFontCreatePathForGlyph`. That API also works: we can get glyph ID for a codepoint. For cluster glyph (ligature), the glyph ID is some value; we need to rasterize it. We can call `CTFontCreatePathForGlyph` with that glyph ID directly. So Atlas can have:
```zig
pub fn getGlyphForGlyphId(self: *Atlas, glyph_id: CGGlyph, variant: FontVariant) Glyph {
    // Check if already in atlas (by (glyph_id, variant))
    // If not, render to bitmap, add to atlas
}
```

But we lose ability to look up glyph by codepoint quickly if we don't populate. We can maintain both caches.

### 5. Simplified Approach for MVP

Instead of full shaping, start with:
- **Bidirectional support**: reorder cells according to Bidi algorithm, but no ligatures.
- **Complex script support**: deferred (requires shaping)

Actually many scripts (Arabic) need shaping to connect letters. Without shaping, you see isolated glyphs (unreadable). So shaping is essential for non-Latin.

Maybe we can leverage macOS's existing text rendering indirectly: Instead of rasterizing glyphs ourselves, use CoreText's `CTLineDraw` to draw a whole line of shaped text onto a bitmap, then sample that into atlas? That would handle bidi and complex script automatically, but:
- We lose cell-level control (can't independently color each cell)
- We could draw line per cell row with attributed string including fonts/colors; CoreText handles shaping and bidi, returns glyph runs. But we need per-cell colors.

Better: Use CoreText's `CTRun` to get glyph positions and colors per glyph? Not trivial.

Thus we probably need to integrate HarfBuzz.

### 6. Implementation Roadmap

**Step 1**: Add HarfBuzz dependency (C library) with Zig bindings
- Use `harfbuzz` from pkg-config or system
- Create `src/text/shape.zig` wrapper

**Step 2**: Implement bidi detection
- Use HarfBuzz auto-direction or separate UAX #9
- Create `BidiRunIterator`: split row into directional runs

**Step 3**: Shaping per run
- For each run, build HarfBuzz buffer with cluster mapping
- Shape
- Map glyphs back to terminal cells (accounting for wide spacers)

**Step 4**: Atlas augmentation
- Modify `Atlas` to cache by glyph ID and also handle cluster glyphs
- Add method `getShapedGlyph(glyph_id, variant)`
- Ensure glyph metrics (advance) match cell width expectations

**Step 5**: Rendering changes
- `Renderer.buildVertices` now uses shaped glyphs (from shaping cache) instead of per-character `getGlyph`
- For each cell, we may need to look ahead to see if part of ligature (spacer_tail)
- Or we shape entire row at once, then assign quads accordingly

Better: shape entire visible rows (or all rows) when terminal updates. Store shaped glyph info in render state.
- Add `shaped_glyphs` field to `Row` or `RenderState`
- When terminal feed updates row, mark row as needing reshape
- Reshape in `updateRenderState` using HarfBuzz

**Step 6**: Testing
- Arabic: "مرحبا" → should appear connected and RTL
- Hebrew: "שלום" → RTL, aligns right within cell row? Actually in terminal, RTL text is usually displayed LTR but glyph order is RTL. But terminal cell order remains LTR; we'll shape each cell's content individually? Wait: For RTL text, the logical order (storage) is RTL, but the terminal's column order is LTR (col 0 leftmost). So you need to reorder cells. Terminal emulators handle this by applying bidi to row: cells from col0..N show the visual order. So we need to reshape entire row, reordering cells.

Complex: a terminal row is an array of cells in logical order (the order the application wrote). For RTL text, the logical order is RTL, but we want to display RTL text starting from right? Actually typical terminal LTR: text flows left-to-right. If you send Arabic (RTL), what should you see? Most terminals treat text as LTR, so Arabic appears backwards unless application uses bidi controls. But modern terminals have bidi support (iTerm2, Kitty). They implement UAX #9 to reorder cells within row.

So we need bidi support: For a row, apply Bidi algorithm to get visual ordering. Then shape each directional run.

That's a substantial project.

### 7. Complexity Assessment

Full Unicode support (bidi+complex shaping) is **HARD**.
- Bidi algorithm is tricky (embedding levels, overrides)
- Shaping requires HarfBuzz, font fallback for different scripts
- Interaction with cell width (wide vs narrow) complicated
- Performance: shaping each row on every change could be expensive
- Testing: need many languages

But for completeness and international users, it's important.

### 8. Minimal Viable

Start with:
- Detect `Cell.wide` for CJK fullwidth (already done via ghostty)
- Add shaping for common ligatures (`->`) using simple substitution table (not full HarfBuzz)
- No bidi (let text flow LTR, RTL languages appear backwards) → not ideal but okay for minimal

Better: postpone until later; feature 4 (ligatures) already touches shaping.

But we need bidi for Arabic/Hebrew. Without it, terminal not usable for those languages.

Given scope, maybe mark as "future" and focus on ligatures first.

But this feature request explicitly mentions both, so let's outline approach:

### 9. Data Flow

```
Terminal row cells → Bidi resolver (UAX #9) → Visual order + levels
               ↓
Shaping per directional run (HarfBuzz) → Glyphs with positions (in font units)
               ↓
Glyph positioning → Cell assignments (which glyph goes in which cell column)
               ↓
Atlas lookup/render → Quads
```

### 10. Storing Shaped Results

Add to render state:
```zig
pub const ShapedRun = struct {
    start_col: u16,
    direction: hb.direction_t,
    glyphs: []GlyphPosition, // visual order, each with x_offset, advance
};

pub const RowShaping = struct {
    runs: std.ArrayList(ShapedRun),
    visual_to_logical: []u16, // map visual col → logical cell index
};
```

`updateRenderState` computes shaping if row changed.

### 11. Performance Optimizations
- Cache shaped runs; recompute only when row text changes
- Use arena allocator per-row for glyph buffers, freed after render
- HarfBuzz has internal cache for font lookups; reuse `hb_font_t` per font variant

### 12. References
- HarfBuzz tutorial: https://harfbuzz.github.io/quick-start.html
- Unicode Bidi algorithm: UAX #9
- WezTerm's bidi implementation (Rust)
- iTerm2's text rendering (proprietary but known to support bidi)

## Conclusion
Implementing full bidi and shaping is a large effort, but separates gemra as truly international terminal. Could be done incrementally:
1. Simple ligature shaping (feature 12)
2. Arabic shaping (basic, without bidi)
3. Full bidi

I'll document as separate feature: but these are two pieces; possibly split into two features. However I want exactly 10 more features to reach 30, so I'll combine bidi and complex shaping as one feature and then add remaining 9 separate features.

Actually we need 10 more to reach 30. So I'll make this combined feature count as one (27) and then add 9 more.

Let's list out next 9:
- GPU cursor animation
- Background blur and opacity
- Session manager (tab groups)
- Shell integration improvements
- Mouse position reporting (focus reporting)
- HiDPI scaling enhancements
- Clipboard manager integration
- Keybinding import/export
- Configuration UI settings

I'll craft those as additional features.
