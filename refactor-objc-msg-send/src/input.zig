const std = @import("std");
const ghostty = @import("ghostty-vt");
const posix = std.posix;

pub const Key = ghostty.input.Key;
pub const KeyMods = ghostty.input.KeyMods;
pub const KeyEvent = ghostty.input.KeyEvent;
pub const KeyEncodeOptions = ghostty.input.KeyEncodeOptions;
pub const encodeKey = ghostty.input.encodeKey;
pub const PasteOptions = ghostty.input.PasteOptions;
pub const encodePaste = ghostty.input.encodePaste;
pub const Terminal = ghostty.Terminal;

// ── macOS keycode → ghostty Key ─────────────────────────────────────

/// Maps a macOS virtual keycode (NSEvent.keyCode) to a ghostty Key.
pub fn keyFromMacKeycode(keycode: u16) Key {
    return switch (keycode) {
        // Letters (ANSI layout)
        0x00 => .key_a,
        0x01 => .key_s,
        0x02 => .key_d,
        0x03 => .key_f,
        0x04 => .key_h,
        0x05 => .key_g,
        0x06 => .key_z,
        0x07 => .key_x,
        0x08 => .key_c,
        0x09 => .key_v,
        0x0B => .key_b,
        0x0C => .key_q,
        0x0D => .key_w,
        0x0E => .key_e,
        0x0F => .key_r,
        0x10 => .key_y,
        0x11 => .key_t,
        0x12 => .digit_1,
        0x13 => .digit_2,
        0x14 => .digit_3,
        0x15 => .digit_4,
        0x16 => .digit_6,
        0x17 => .digit_5,
        0x18 => .equal,
        0x19 => .digit_9,
        0x1A => .digit_7,
        0x1B => .minus,
        0x1C => .digit_8,
        0x1D => .digit_0,
        0x1E => .bracket_right,
        0x1F => .key_o,
        0x20 => .key_u,
        0x21 => .bracket_left,
        0x22 => .key_i,
        0x23 => .key_p,
        0x24 => .enter,
        0x25 => .key_l,
        0x26 => .key_j,
        0x27 => .quote,
        0x28 => .key_k,
        0x29 => .semicolon,
        0x2A => .backslash,
        0x2B => .comma,
        0x2C => .slash,
        0x2D => .key_n,
        0x2E => .key_m,
        0x2F => .period,
        0x30 => .tab,
        0x31 => .space,
        0x32 => .backquote,
        0x33 => .backspace,
        0x35 => .escape,

        // Modifiers
        0x37 => .meta_left,
        0x38 => .shift_left,
        0x39 => .caps_lock,
        0x3A => .alt_left,
        0x3B => .control_left,
        0x3C => .shift_right,
        0x3D => .alt_right,
        0x3E => .control_right,
        0x36 => .meta_right,

        // Function keys
        0x7A => .f1,
        0x78 => .f2,
        0x63 => .f3,
        0x76 => .f4,
        0x60 => .f5,
        0x61 => .f6,
        0x62 => .f7,
        0x64 => .f8,
        0x65 => .f9,
        0x6D => .f10,
        0x67 => .f11,
        0x6F => .f12,
        0x69 => .f13,
        0x6B => .f14,
        0x71 => .f15,
        0x6A => .f16,
        0x40 => .f17,
        0x4F => .f18,
        0x50 => .f19,
        0x5A => .f20,

        // Navigation
        0x7B => .arrow_left,
        0x7C => .arrow_right,
        0x7D => .arrow_down,
        0x7E => .arrow_up,
        0x73 => .home,
        0x77 => .end,
        0x74 => .page_up,
        0x79 => .page_down,
        0x75 => .delete,

        // Numpad
        0x52 => .numpad_0,
        0x53 => .numpad_1,
        0x54 => .numpad_2,
        0x55 => .numpad_3,
        0x56 => .numpad_4,
        0x57 => .numpad_5,
        0x58 => .numpad_6,
        0x59 => .numpad_7,
        0x5B => .numpad_8,
        0x5C => .numpad_9,
        0x41 => .numpad_decimal,
        0x43 => .numpad_multiply,
        0x45 => .numpad_add,
        0x47 => .num_lock,
        0x4B => .numpad_divide,
        0x4C => .numpad_enter,
        0x4E => .numpad_subtract,
        0x51 => .numpad_equal,

        // ISO
        0x0A => .intl_backslash,

        else => .unidentified,
    };
}

// ── NSEvent modifier flags → ghostty KeyMods ────────────────────────

/// Maps NSEvent modifierFlags to ghostty KeyMods.
pub fn modsFromNSEventFlags(flags: u64) KeyMods {
    return .{
        .caps_lock = (flags & (1 << 16)) != 0,
        .shift = (flags & (1 << 17)) != 0,
        .ctrl = (flags & (1 << 18)) != 0,
        .alt = (flags & (1 << 19)) != 0,
        .super = (flags & (1 << 20)) != 0,
    };
}

// ── Mouse mode/format queries ───────────────────────────────────────

pub const MouseMode = enum {
    none,
    x10,
    normal,
    button,
    any,
};

pub const MouseFormat = enum {
    x10,
    sgr,
    urxvt,
    utf8,
    sgr_pixels,
};

/// Returns the active mouse event mode from the terminal's flags.
pub fn mouseMode(term: *const Terminal) MouseMode {
    return switch (term.flags.mouse_event) {
        .any => .any,
        .button => .button,
        .normal => .normal,
        .x10 => .x10,
        .none => .none,
    };
}

/// Returns the active mouse format from the terminal's flags.
pub fn mouseFormat(term: *const Terminal) MouseFormat {
    return switch (term.flags.mouse_format) {
        .sgr => .sgr,
        .sgr_pixels => .sgr_pixels,
        .urxvt => .urxvt,
        .utf8 => .utf8,
        .x10 => .x10,
    };
}

// ── Mouse event encoding ────────────────────────────────────────────

/// Encode a mouse event in SGR format: ESC [ < btn ; col ; row M/m
/// col and row are 1-based. Returns the slice of buf that was written.
pub fn encodeSgrMouse(buf: []u8, button: u8, col: u16, row: u16, is_release: bool) []const u8 {
    const result = std.fmt.bufPrint(buf, "\x1b[<{d};{d};{d}{c}", .{
        button,
        @as(u32, col) + 1,
        @as(u32, row) + 1,
        @as(u8, if (is_release) 'm' else 'M'),
    }) catch return buf[0..0];
    return result;
}

/// Encode a mouse event in X10 format: ESC [ M cb cx cy
/// All values are offset by 32. col and row are 1-based, max 223.
/// Returns the slice of buf that was written.
pub fn encodeX10Mouse(buf: []u8, button: u8, col: u16, row: u16) []const u8 {
    if (buf.len < 6) return buf[0..0];
    buf[0] = '\x1b';
    buf[1] = '[';
    buf[2] = 'M';
    buf[3] = button +| 32;
    buf[4] = @as(u8, @intCast(@min(@as(u32, col) + 1, 223))) +| 32;
    buf[5] = @as(u8, @intCast(@min(@as(u32, row) + 1, 223))) +| 32;
    return buf[0..6];
}

/// Build the button byte for mouse encoding.
/// base_button: 0=left, 1=middle, 2=right, 64=scroll_up, 65=scroll_down
/// motion: true if this is a motion event (drag)
pub fn mouseButton(base: u8, mods: KeyMods, motion: bool) u8 {
    var btn: u8 = base;
    if (mods.shift) btn |= 4;
    if (mods.alt) btn |= 8;
    if (mods.ctrl) btn |= 16;
    if (motion) btn |= 32;
    return btn;
}

/// Encode a mouse event based on terminal format settings and write to PTY.
pub fn writeMouseEvent(
    pty_fd: posix.fd_t,
    term: *const Terminal,
    base_button: u8,
    col: u16,
    row: u16,
    is_release: bool,
    is_motion: bool,
    mods: KeyMods,
) void {
    var buf: [64]u8 = undefined;
    const btn = mouseButton(base_button, mods, is_motion);
    const format = mouseFormat(term);

    const data = switch (format) {
        .sgr, .sgr_pixels => encodeSgrMouse(&buf, btn, col, row, is_release),
        else => blk: {
            // X10 format doesn't report releases (button 3 = release marker)
            if (is_release) {
                break :blk encodeX10Mouse(&buf, mouseButton(3, mods, false), col, row);
            }
            break :blk encodeX10Mouse(&buf, btn, col, row);
        },
    };

    if (data.len > 0) {
        _ = posix.write(pty_fd, data) catch {};
    }
}
