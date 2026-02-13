# Feature 10: Sixel Graphics Protocol Support

## Overview
Implement Sixel (DEC) and Kitty graphics protocol support to display raster images, diagrams, and inline graphics directly in the terminal, enabling rich content display for data visualization, documentation previews, and image viewing.

## Problem
Terminal can only display ASCII/Unicode text. Users cannot view:
- Images (PNG, JPEG, GIF) inline
- Graphs/charts from CLI tools (gource, asciinema, sshfs)
- QR codes
- Syntax-highlighted code with background colors
- Thumbnail previews of files

Many modern CLI tools output graphics (e.g., `ls --icons`, `exa --icons`, `bat --style=plain` with images, `k9s`, `lazygit`).

## Proposed Solution

### 1. Protocol Support Priority

#### Sixel (DEC)
- Legacy but widely supported (xterm, mintty, mint, some Konsole)
- Based on 6-pixel high vertical bands ("sixel")
- Simple but verbose encoding
- Good for monochrome and 256-color indexed images

#### Kitty Graphics Protocol
- Modern, efficient, feature-rich
- Used by Kitty terminal and adopted by others (WezTerm, iTerm2 partially)
- Supports: PNG/JPEG/GIF, animation, placement modes (cursor-relative, absolute)
- Better compression and performance

#### iTerm2 Proprietary Protocol
- Consider for compatibility but secondary (closed spec)
- Well documented: https://iterm2.com/documentation-images.html

### 2. Architecture

```
PTY Output → Terminal Emulator → Graphics Renderer
      ↓ escape detection         ↓ protocol parser
   byte stream                graphics commands
                                ↓
                         Image Cache (GPU textures)
                                ↓
                         Terminal Renderer (blending)
```

**Graphics Layer**:
- Separate from cell-based rendering
- Draw graphics in terminal's "image plane" behind/over cells
- Z-index: cells can be over/under images (configurable)
- Anchor point: top-left of cell grid or cursor position

### 3. Parser Implementation

#### Sixel Decoder
```zig
const SixelDecoder = struct {
    palette: [256]Color,     // 256-color palette
    image: DynamicBitmap,    // RGBA bitmap being constructed
    col: u32 = 0,
    row: u32 = 0,
    bg_color: Color = .{0,0,0,0},

    pub fn feed(self: *SixelDecoder, bytes: []const u8) void {
        var i: usize = 0;
        while (i < bytes.len) {
            const c = bytes[i];
            switch (c) {
                0x0 => {}, // NUL ignored
                0x1b => { // ESC sequence
                    // Handle DECGRI, DECGNL, etc.
                },
                '0'...'?' => {
                    // Repeat count or color palette definition
                },
                '@'...'~' => {
                    // Sixel data: 6 rows × (col) pixels
                    // Use bit unpacking: each char encodes 6-bit values for 6 pixels
                    // Set self.image pixels accordingly
                },
            }
            i += 1;
        }
    }
};
```

#### Kitty Protocol Parser
Kitty format: `\e_Gq=...;...:payload\e\\`
- Much simpler: base64-encoded binary payload
- Just need to decode base64, parse PNG/JPEG, upload to GPU

### 4. Image Cache
- Cache decoded images by ID (Sixel repeats; Kitty assigns ID)
- LRU eviction (max 100 images or 500MB)
- GPU texture storage (`MTLTexture`)
- Serialize to disk for persistence across sessions (optional)

### 5. Terminal Commands

#### Sixel Commands
- `DCS 0 q` → Sixel mode start
- Inside: palette definitions (`#1;rgb:RR/GG/BB`), pixel data
- `DCS 0 ;` or `ST` → end

#### Kitty Commands
```
\e_Gf=24;=<id>\e\\           # Delete image by ID
\e_Gi=1;=<id>\e\\           # Transmit (display) image
\e_GI=1;=<id>\e\\           # Same as above
\e_Gu=1;=<id>;=<x>,<y>\e\\ # Place image at (col,row)
```

Placement modes:
- Relative to cursor
- Relative to top-left
- Scroll-aware: image fixed in scrollback or scrolls with content

### 6. Rendering Integration

**Cell Grid Composition**:
- Images drawn on separate layer but in same coordinate space
- Image positioned by grid cell anchor (x, y in cells)
- Image size in pixels or cells
- Alpha blending with cell background

**Three modes**:
1. `overlay`: Image on top of text (default)
2. `underlay`: Image behind text (text foreground overlays)
3. `replace`: Image replaces cell content (cells transparent where image overlaps)

Implementation in renderer:
```zig
fn renderImages(self: *Renderer, term: *Terminal, layer: objc.id) void {
    for (term.image_cache.images) |img| {
        // Compute screen position from img.anchor (col, row) + offset
        const x = img.col * self.atlas.cell_width + img.offset_x;
        const y = img.row * self.atlas.cell_height + img.offset_y;

        // Draw textured quad with image texture
        drawImageQuad(self, img.texture, x, y, img.width, img.height, img.opacity);
    }
}
```

### 7. Security & Stability
- Reject huge images (>10MB uncompressed) by default
- Limit total image memory (config: `graphics.max_cache_mb = 256`)
- Rate-limit image display commands (prevent DoS)
- Validate image format (reject malformed PNG/JPEG)
- Sandbox image decoding in separate thread (crash isolation)

### 8. Configuration
```json
{
  "graphics": {
    "enabled": true,
    "protocols": ["sixel", "kitty"],  // Order preference
    "cache_size_mb": 256,
    "max_images": 100,
    "persist_cache": false,
    "default_placement": "overlay",  // or "underlay"
    "allow_animation": true  // GIF animation support
  }
}
```

### 9. Testing
- Sixel: `img2sixel` output, `sixel` command
- Kitty: `kitty +kitten icat` output
- Both: Known test vectors (sample encoded images)
- Fallback: unsupported protocol → ignore but don't crash

### 10. Performance
- Image decoding on background thread pool (not rendering thread)
- GPU texture upload async (blit command buffer)
- Draw images with batch calls (instancing)
- Texture atlasing for small images (<256×256) to reduce draw calls

### 11. Future Extensions
- Animation: animated GIFs, APNG (decode frames, animate)
- Image transformations: scale, rotate (via Kitty protocol)
- Hyperlinks: image maps with click callbacks
- True-color (24-bit) Sixel extension (DEC)

## References
- Sixel spec: https://invisible-island.net/xterm/ctlseqs/ctlseqs.html#h2-Sixel-Graphics
- Kitty graphics protocol: https://sw.kovidgoyal.net/kitty/graphics-protocol/
- picoterm (Rust sixel) implementation
- WezTerm graphics implementation (Rust)
