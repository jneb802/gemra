# Feature 12: Ligature Rendering for Code Fonts

## Overview
Render programming ligatures (fi, fl, ->, =>, ===, ≠, etc.) when using ligature-enabled fonts (Fira Code, JetBrains Mono, Hasklig) to improve code readability and aesthetics, with per-font automatic detection and optional disable/enable control.

## Problem
Ligature fonts are popular among developers for their visual clarity:
- `->` rendered as single arrow glyph instead of two characters
- `!=` as single ≠ glyph
- Multi-character operators become single connected shapes
- Current implementation treats each codepoint independently, missing ligatures

## Proposed Solution

### 1. Font Variant with Ligatures
Extend existing `FontVariant` (regular/bold/italic/bold_italic) to include ligature variant:
```zig
pub const FontVariant = enum {
    regular,
    bold,
    italic,
    bold_italic,
    ligature_regular,
    ligature_bold,
    ligature_italic,
    ligature_bold_italic,
};
```

Or more elegantly: treat ligatures as a font feature flag:
```zig
const FontFeatures = struct {
    ligatures: bool = false,
    discretionary_liga: bool = false,
    historical_liga: bool = false,
    // ...
};
```

### 2. Glyph Lookup with Ligature Sequences
When rendering a cell:
1. Check if current font supports ligatures (query OpenType features)
2. Look ahead in text buffer to form eligible ligature sequences (2-4 characters)
3. If ligature glyph exists for sequence, fetch that glyph instead
4. Set cell width to ligature advance (typically same as sum of parts, but not always)
5. Advance cursor by logical characters rendered, not glyphs consumed

**Algorithm**:
```zig
fn getGlyphWithLigatures(atlas: *Atlas, row: []const Cell, col: usize) Glyph {
    const style = row[col].style;
    const variant = fontVariantFromStyle(style);

    // Check if ligatures enabled globally and for this font
    if (!atlas.font_has_ligatures or !atlas.ligature_enabled) {
        return atlas.getGlyph(row[col].codepoint(), variant);
    }

    // Build candidate sequence
    var sequence: [4]u21 = undefined;
    var sequence_len: usize = 0;
    var i: usize = col;

    // Gather up to 4 codepoints (max ligature length)
    while (i < row.len and sequence_len < 4) : (i += 1) {
        const cell = row[i];
        if (cell.wide == .spacer_tail) continue; // Skip spacer
        sequence[sequence_len] = cell.codepoint();
        sequence_len += 1;
        // Stop if cell has styling different from first? Ligatures usually same style
        if (cell.hasStyling() and cell.style != row[col].style) break;
    }

    // Search for ligature in font's GSUB table
    if (sequence_len >= 2) {
        if (const ligature_glyph = atlas.findLigature(sequence[0..sequence_len], variant)) {
            return ligature_glyph;
        }
    }

    // Fallback: single glyph
    return atlas.getGlyph(row[col].codepoint(), variant);
}
```

### 3. Font Feature Discovery
Atlas initialization must query OpenType features:
- Use CoreText (macOS) to get `CTFontDescriptor` with feature settings
- Or FreeType `FT_Get_CMap_Language_Id` / `FT_Get_Glyph_Name`
- Check for `liga`, `dlig`, `hlig`, `calt` feature tags
- Store boolean flags per font variant

Implementation (macOS):
```zig
const kUpperCaseType = 0x6c706761; // 'liga' in big-endian
const ligature_feature = coretext.CTFontDescriptorCreateWithAttributes(
    coretext.kCTFontLigaturesAttribute, coretext.kCTFontLigaturesAttribute.ligatures_on
);
```

Actually need to query `CTFontCopyTable(font, kCTTableGSUB, ...)` to read GSUB.

### 4. Cursor Advancement
Critical: cursor moves by **logical characters**, not ligature glyphs.
- Ligature `->` occupies 2 cells (width = sum of '-' and '>' advances)
- Rendered as single quad covering both cells
- Cursor position unchanged by ligature
- Selection handles ligatures correctly (treat as separate chars)

**Vertex generation**:
- For ligature covering N cells: generate N cell positions but sample same texture
- Or generate single quad spanning N cells: x0=cell[col], x1=cell[col+N]
- Each cell in range gets background+border drawn normally

### 5. Configurability
```json
{
  "font": {
    "ligatures": true,              // Global enable
    "font_ligature_overrides": {
      "Fira Code": true,
      "JetBrains Mono": true,
      "Menlo": false
    }
  }
}
```

### 6. Feature Toggle per Font
Some monospaced fonts claim ligature support but should not use (st dev issues):
- Allow `font.ligatures = false` globally
- Override per-font name pattern

### 7. Implementation Phases

**Phase 1**: Detect ligature support, render simple 2-char ligatures (`->`, `=>`, `!=`, `<=`, `>=`)
- Hardcode common programming ligature patterns
- Match against font's GSUB table (feature tag `liga`)
- Update atlas to store ligature glyphs in separate region or same atlas

**Phase 2**: Support variable-length ligatures (3-4 chars)
- `===`, `!==`, `<-`, `->`, `::=`, etc.
- More efficient GSUB lookup (use trie/perfect hash)

**Phase 3**: Discretionary/contextual ligatures
- `calt` (contextual alternates) for font-specific typography
- Track surrounding context beyond immediate cell (word/line level)

### 8. Atlas Changes

Current atlas:
- One glyph per codepoint per variant

With ligatures:
- Need composite keys: (codepoint sequence) → glyph
- Add additional texture region for ligature glyphs (indexed separately)
- Hash map: `std.AutoHashMap(ligature_key, glyph_index)`
- `ligature_key` is hash of u21[4] array (padded)

Or simpler: store ligature glyphs in same atlas, different texture coordinates.
Key lookup: single codepoint → fast path; sequence → slower map lookup.

### 9. Performance Impact
- **Lookup cost**: Additional hash lookup per cell (amortized ~20ns with good hash)
- **Cache locality**: Ligature cache fits in L2 (few thousand entries)
- **Rendering cost**: Fewer quads drawn (e.g., 2 cells → 1 quad) = half vertex count
- **Overall**: Minimal impact; benefit for code-heavy users

### 10. Testing
- Render code with Fira Code: `->`, `=>`, `==`, `!=`, `for i in 1..10`
- Verify ligatures appear, cursor advances correctly
- Copy-paste: ligature text still copies as regular characters
- Selection: multi-char selection covers ligature without breaking
- Mixed fonts: if fallback font lacks ligature, use standard glyphs

### 11. Edge Cases
- **Half-width/combining marks**: ligature should not consume combining chars
- **Wide characters**: CJK width with ligature? Probably none, but handle
- **Line breaks**: don't ligature across line wrap boundaries
- **Style changes**: `bold` + `italic` variant may have different ligatures

### 12. Alternatives Considered
- **Use HarfBuzz**: Full text shaping engine (overkill, large code)
- **Precompute all ligatures at font load**: Explodes with N×N combinations
- **Shader-based ligature detection**: Not feasible; need CPU for shaping

**Decision**: Hybrid approach: core ligatures precomputed, on-the-fly lookup for sequences.

### 13. Font Fallback
If primary font lacks ligature for sequence:
- Scan fallback fonts in order
- Use first font that has ligature glyph
- Might produce mixed-font ligature (ugly) → don't ligature if any font in chain lacks

Better: don't ligature unless ALL fonts in chain support the sequence (consistent rendering).

## References
- OpenType spec: GSUB table for ligature substitution
- Fira Code ligature list: https://github.com/tonsky/FiraCode/blob/master/FiraCode-Ligatures.pdf
- HarfBuzz shaping tutorial (conceptual)
- WezTerm's ligature support (Rust)
