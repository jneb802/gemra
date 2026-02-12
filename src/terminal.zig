const std = @import("std");

pub const Color = struct {
    r: u8,
    g: u8,
    b: u8,

    pub fn eql(a: Color, b: Color) bool {
        return a.r == b.r and a.g == b.g and a.b == b.b;
    }
};

// Standard 16-color ANSI palette
pub const ansi_colors = [16]Color{
    .{ .r = 0, .g = 0, .b = 0 }, // 0: black
    .{ .r = 170, .g = 0, .b = 0 }, // 1: red
    .{ .r = 0, .g = 170, .b = 0 }, // 2: green
    .{ .r = 170, .g = 85, .b = 0 }, // 3: yellow/brown
    .{ .r = 0, .g = 0, .b = 170 }, // 4: blue
    .{ .r = 170, .g = 0, .b = 170 }, // 5: magenta
    .{ .r = 0, .g = 170, .b = 170 }, // 6: cyan
    .{ .r = 170, .g = 170, .b = 170 }, // 7: white
    .{ .r = 85, .g = 85, .b = 85 }, // 8: bright black (gray)
    .{ .r = 255, .g = 85, .b = 85 }, // 9: bright red
    .{ .r = 85, .g = 255, .b = 85 }, // 10: bright green
    .{ .r = 255, .g = 255, .b = 85 }, // 11: bright yellow
    .{ .r = 85, .g = 85, .b = 255 }, // 12: bright blue
    .{ .r = 255, .g = 85, .b = 255 }, // 13: bright magenta
    .{ .r = 85, .g = 255, .b = 255 }, // 14: bright cyan
    .{ .r = 255, .g = 255, .b = 255 }, // 15: bright white
};

pub const default_fg = Color{ .r = 200, .g = 200, .b = 200 };
pub const default_bg = Color{ .r = 30, .g = 30, .b = 30 };

pub const Attributes = packed struct {
    bold: bool = false,
    italic: bool = false,
    underline: bool = false,
    inverse: bool = false,
    _pad: u4 = 0,
};

pub const Cell = struct {
    char: u21 = ' ',
    fg: Color = default_fg,
    bg: Color = default_bg,
    attrs: Attributes = .{},
};

pub const Grid = struct {
    cells: []Cell,
    cols: u16,
    rows: u16,
    cursor_col: u16 = 0,
    cursor_row: u16 = 0,
    dirty: bool = true,

    // SGR state
    current_fg: Color = default_fg,
    current_bg: Color = default_bg,
    current_attrs: Attributes = .{},

    // VT parser state
    state: ParserState = .ground,
    params: [16]u16 = [_]u16{0} ** 16,
    param_count: u8 = 0,
    intermediate: u8 = 0,

    // Saved cursor position (for DECSC/DECRC)
    saved_cursor_col: u16 = 0,
    saved_cursor_row: u16 = 0,

    allocator: std.mem.Allocator,

    pub fn init(allocator: std.mem.Allocator, cols: u16, rows: u16) !Grid {
        const cells = try allocator.alloc(Cell, @as(usize, cols) * @as(usize, rows));
        @memset(cells, Cell{});

        return Grid{
            .cells = cells,
            .cols = cols,
            .rows = rows,
            .allocator = allocator,
        };
    }

    pub fn deinit(self: *Grid) void {
        self.allocator.free(self.cells);
    }

    fn cellAt(self: *Grid, col: u16, row: u16) *Cell {
        return &self.cells[@as(usize, row) * @as(usize, self.cols) + @as(usize, col)];
    }

    fn scrollUp(self: *Grid) void {
        const stride = @as(usize, self.cols);
        const total = stride * @as(usize, self.rows);
        // Move all rows up by one
        std.mem.copyForwards(Cell, self.cells[0 .. total - stride], self.cells[stride..total]);
        // Clear last row
        @memset(self.cells[total - stride .. total], Cell{});
    }

    fn putChar(self: *Grid, char: u21) void {
        if (self.cursor_col >= self.cols) {
            // Auto-wrap
            self.cursor_col = 0;
            self.cursor_row += 1;
            if (self.cursor_row >= self.rows) {
                self.scrollUp();
                self.cursor_row = self.rows - 1;
            }
        }

        const cell = self.cellAt(self.cursor_col, self.cursor_row);
        cell.char = char;
        cell.fg = if (self.current_attrs.inverse) self.current_bg else self.current_fg;
        cell.bg = if (self.current_attrs.inverse) self.current_fg else self.current_bg;
        cell.attrs = self.current_attrs;

        self.cursor_col += 1;
        self.dirty = true;
    }

    fn newline(self: *Grid) void {
        self.cursor_row += 1;
        if (self.cursor_row >= self.rows) {
            self.scrollUp();
            self.cursor_row = self.rows - 1;
        }
        self.dirty = true;
    }

    fn carriageReturn(self: *Grid) void {
        self.cursor_col = 0;
        self.dirty = true;
    }

    fn backspace(self: *Grid) void {
        if (self.cursor_col > 0) {
            self.cursor_col -= 1;
        }
        self.dirty = true;
    }

    fn tab(self: *Grid) void {
        // Move to next tab stop (every 8 columns)
        self.cursor_col = @min(self.cols - 1, (self.cursor_col + 8) & ~@as(u16, 7));
        self.dirty = true;
    }

    fn eraseInLine(self: *Grid, mode: u16) void {
        switch (mode) {
            0 => { // Erase from cursor to end of line
                var col = self.cursor_col;
                while (col < self.cols) : (col += 1) {
                    self.cellAt(col, self.cursor_row).* = Cell{};
                }
            },
            1 => { // Erase from start to cursor
                var col: u16 = 0;
                while (col <= self.cursor_col) : (col += 1) {
                    self.cellAt(col, self.cursor_row).* = Cell{};
                }
            },
            2 => { // Erase entire line
                var col: u16 = 0;
                while (col < self.cols) : (col += 1) {
                    self.cellAt(col, self.cursor_row).* = Cell{};
                }
            },
            else => {},
        }
        self.dirty = true;
    }

    fn eraseInDisplay(self: *Grid, mode: u16) void {
        switch (mode) {
            0 => { // Erase from cursor to end
                // Clear rest of current line
                self.eraseInLine(0);
                // Clear all lines below
                var row = self.cursor_row + 1;
                while (row < self.rows) : (row += 1) {
                    var col: u16 = 0;
                    while (col < self.cols) : (col += 1) {
                        self.cellAt(col, row).* = Cell{};
                    }
                }
            },
            1 => { // Erase from start to cursor
                // Clear all lines above
                var row: u16 = 0;
                while (row < self.cursor_row) : (row += 1) {
                    var col: u16 = 0;
                    while (col < self.cols) : (col += 1) {
                        self.cellAt(col, row).* = Cell{};
                    }
                }
                self.eraseInLine(1);
            },
            2, 3 => { // Erase entire display
                @memset(self.cells, Cell{});
                self.cursor_col = 0;
                self.cursor_row = 0;
            },
            else => {},
        }
        self.dirty = true;
    }

    fn deleteChars(self: *Grid, count: u16) void {
        const n = @min(count, self.cols - self.cursor_col);
        const row_start = @as(usize, self.cursor_row) * @as(usize, self.cols);
        const start = row_start + self.cursor_col;
        const end = row_start + self.cols;

        if (self.cursor_col + n < self.cols) {
            std.mem.copyForwards(Cell, self.cells[start .. end - n], self.cells[start + n .. end]);
        }
        @memset(self.cells[end - n .. end], Cell{});
        self.dirty = true;
    }

    fn insertLines(self: *Grid, count: u16) void {
        const n = @min(count, self.rows - self.cursor_row);
        const stride = @as(usize, self.cols);

        var row: u16 = self.rows - 1;
        while (row >= self.cursor_row + n) : (row -= 1) {
            const dst = @as(usize, row) * stride;
            const src = @as(usize, row - n) * stride;
            @memcpy(self.cells[dst .. dst + stride], self.cells[src .. src + stride]);
            if (row == self.cursor_row + n) break;
        }

        var clear_row = self.cursor_row;
        while (clear_row < self.cursor_row + n) : (clear_row += 1) {
            const start = @as(usize, clear_row) * stride;
            @memset(self.cells[start .. start + stride], Cell{});
        }
        self.dirty = true;
    }

    fn deleteLines(self: *Grid, count: u16) void {
        const n = @min(count, self.rows - self.cursor_row);
        const stride = @as(usize, self.cols);

        var row = self.cursor_row;
        while (row + n < self.rows) : (row += 1) {
            const dst = @as(usize, row) * stride;
            const src = @as(usize, row + n) * stride;
            @memcpy(self.cells[dst .. dst + stride], self.cells[src .. src + stride]);
        }

        while (row < self.rows) : (row += 1) {
            const start = @as(usize, row) * stride;
            @memset(self.cells[start .. start + stride], Cell{});
        }
        self.dirty = true;
    }

    fn eraseChars(self: *Grid, count: u16) void {
        const n = @min(count, self.cols - self.cursor_col);
        var col = self.cursor_col;
        while (col < self.cursor_col + n) : (col += 1) {
            self.cellAt(col, self.cursor_row).* = Cell{};
        }
        self.dirty = true;
    }

    fn handleSGR(self: *Grid) void {
        if (self.param_count == 0) {
            // ESC[m with no params = reset
            self.current_fg = default_fg;
            self.current_bg = default_bg;
            self.current_attrs = .{};
            return;
        }

        var i: u8 = 0;
        while (i < self.param_count) : (i += 1) {
            const p = self.params[i];
            switch (p) {
                0 => {
                    self.current_fg = default_fg;
                    self.current_bg = default_bg;
                    self.current_attrs = .{};
                },
                1 => self.current_attrs.bold = true,
                3 => self.current_attrs.italic = true,
                4 => self.current_attrs.underline = true,
                7 => self.current_attrs.inverse = true,
                22 => self.current_attrs.bold = false,
                23 => self.current_attrs.italic = false,
                24 => self.current_attrs.underline = false,
                27 => self.current_attrs.inverse = false,
                30...37 => self.current_fg = ansi_colors[p - 30],
                38 => {
                    // Extended color: 38;5;n (256 color) or 38;2;r;g;b (truecolor)
                    if (i + 1 < self.param_count and self.params[i + 1] == 5) {
                        if (i + 2 < self.param_count) {
                            const idx = self.params[i + 2];
                            if (idx < 16) {
                                self.current_fg = ansi_colors[idx];
                            }
                            // Skip 256-color values beyond 16 for MVP
                            i += 2;
                        }
                    } else if (i + 1 < self.param_count and self.params[i + 1] == 2) {
                        if (i + 4 < self.param_count) {
                            self.current_fg = .{
                                .r = @truncate(self.params[i + 2]),
                                .g = @truncate(self.params[i + 3]),
                                .b = @truncate(self.params[i + 4]),
                            };
                            i += 4;
                        }
                    }
                },
                39 => self.current_fg = default_fg,
                40...47 => self.current_bg = ansi_colors[p - 40],
                48 => {
                    if (i + 1 < self.param_count and self.params[i + 1] == 5) {
                        if (i + 2 < self.param_count) {
                            const idx = self.params[i + 2];
                            if (idx < 16) {
                                self.current_bg = ansi_colors[idx];
                            }
                            i += 2;
                        }
                    } else if (i + 1 < self.param_count and self.params[i + 1] == 2) {
                        if (i + 4 < self.param_count) {
                            self.current_bg = .{
                                .r = @truncate(self.params[i + 2]),
                                .g = @truncate(self.params[i + 3]),
                                .b = @truncate(self.params[i + 4]),
                            };
                            i += 4;
                        }
                    }
                },
                49 => self.current_bg = default_bg,
                90...97 => self.current_fg = ansi_colors[p - 90 + 8],
                100...107 => self.current_bg = ansi_colors[p - 100 + 8],
                else => {},
            }
        }
    }

    fn handleCSI(self: *Grid, final_byte: u8) void {
        const p0 = if (self.param_count > 0) self.params[0] else 0;
        const p1 = if (self.param_count > 1) self.params[1] else 0;

        if (self.intermediate == '?') {
            // DEC private modes
            switch (final_byte) {
                'h' => { // DECSET
                    switch (p0) {
                        25 => {}, // Show cursor - we always show it
                        1049 => { // Alternate screen buffer
                            self.saved_cursor_col = self.cursor_col;
                            self.saved_cursor_row = self.cursor_row;
                            @memset(self.cells, Cell{});
                            self.cursor_col = 0;
                            self.cursor_row = 0;
                            self.dirty = true;
                        },
                        else => {},
                    }
                },
                'l' => { // DECRST
                    switch (p0) {
                        25 => {}, // Hide cursor
                        1049 => { // Restore from alternate screen
                            @memset(self.cells, Cell{});
                            self.cursor_col = self.saved_cursor_col;
                            self.cursor_row = self.saved_cursor_row;
                            self.dirty = true;
                        },
                        else => {},
                    }
                },
                else => {},
            }
            return;
        }

        switch (final_byte) {
            'A' => { // Cursor Up
                const n: u16 = if (p0 == 0) 1 else p0;
                self.cursor_row -|= n;
                self.dirty = true;
            },
            'B' => { // Cursor Down
                const n: u16 = if (p0 == 0) 1 else p0;
                self.cursor_row = @min(self.cursor_row + n, self.rows - 1);
                self.dirty = true;
            },
            'C' => { // Cursor Forward
                const n: u16 = if (p0 == 0) 1 else p0;
                self.cursor_col = @min(self.cursor_col + n, self.cols - 1);
                self.dirty = true;
            },
            'D' => { // Cursor Back
                const n: u16 = if (p0 == 0) 1 else p0;
                self.cursor_col -|= n;
                self.dirty = true;
            },
            'E' => { // Cursor Next Line
                const n: u16 = if (p0 == 0) 1 else p0;
                self.cursor_row = @min(self.cursor_row + n, self.rows - 1);
                self.cursor_col = 0;
                self.dirty = true;
            },
            'F' => { // Cursor Previous Line
                const n: u16 = if (p0 == 0) 1 else p0;
                self.cursor_row -|= n;
                self.cursor_col = 0;
                self.dirty = true;
            },
            'G' => { // Cursor Horizontal Absolute
                const col: u16 = if (p0 == 0) 1 else p0;
                self.cursor_col = @min(col - 1, self.cols - 1);
                self.dirty = true;
            },
            'H', 'f' => { // Cursor Position
                const row: u16 = if (p0 == 0) 1 else p0;
                const col: u16 = if (p1 == 0) 1 else p1;
                self.cursor_row = @min(row - 1, self.rows - 1);
                self.cursor_col = @min(col - 1, self.cols - 1);
                self.dirty = true;
            },
            'J' => self.eraseInDisplay(p0),
            'K' => self.eraseInLine(p0),
            'L' => self.insertLines(if (p0 == 0) 1 else p0),
            'M' => self.deleteLines(if (p0 == 0) 1 else p0),
            'P' => self.deleteChars(if (p0 == 0) 1 else p0),
            'X' => self.eraseChars(if (p0 == 0) 1 else p0),
            'd' => { // Vertical Position Absolute
                const row: u16 = if (p0 == 0) 1 else p0;
                self.cursor_row = @min(row - 1, self.rows - 1);
                self.dirty = true;
            },
            'm' => self.handleSGR(),
            'r' => { // DECSTBM - Set scrolling region (ignored for MVP)
            },
            's' => { // Save cursor position
                self.saved_cursor_col = self.cursor_col;
                self.saved_cursor_row = self.cursor_row;
            },
            'u' => { // Restore cursor position
                self.cursor_col = self.saved_cursor_col;
                self.cursor_row = self.saved_cursor_row;
                self.dirty = true;
            },
            'n' => { // Device Status Report - ignored, would need PTY write-back
            },
            'h', 'l' => { // Set/Reset Mode (non-DEC)
            },
            '@' => { // Insert characters
                const n = @min(if (p0 == 0) 1 else p0, self.cols - self.cursor_col);
                const row_start = @as(usize, self.cursor_row) * @as(usize, self.cols);
                const start = row_start + self.cursor_col;
                const end = row_start + self.cols;

                var j: usize = end - 1;
                while (j >= start + n) : (j -= 1) {
                    self.cells[j] = self.cells[j - n];
                    if (j == start + n) break;
                }
                var col = self.cursor_col;
                while (col < self.cursor_col + n) : (col += 1) {
                    self.cellAt(col, self.cursor_row).* = Cell{};
                }
                self.dirty = true;
            },
            else => {},
        }
    }

    // VT parser states
    const ParserState = enum {
        ground,
        escape,
        csi,
        osc,
        osc_string,
    };

    pub fn feed(self: *Grid, data: []const u8) void {
        for (data) |byte| {
            self.feedByte(byte);
        }
    }

    fn feedByte(self: *Grid, byte: u8) void {
        switch (self.state) {
            .ground => {
                switch (byte) {
                    0x1b => { // ESC
                        self.state = .escape;
                        self.param_count = 0;
                        self.params = [_]u16{0} ** 16;
                        self.intermediate = 0;
                    },
                    '\r' => self.carriageReturn(),
                    '\n', 0x0b, 0x0c => self.newline(),
                    0x08 => self.backspace(),
                    '\t' => self.tab(),
                    0x07 => {}, // Bell - ignore
                    0x00...0x06, 0x0e...0x1a, 0x1c...0x1f => {}, // Other C0 controls
                    else => self.putChar(@as(u21, byte)),
                }
            },
            .escape => {
                switch (byte) {
                    '[' => self.state = .csi,
                    ']' => {
                        self.state = .osc;
                        self.param_count = 0;
                    },
                    '(' , ')' , '*', '+' => { // Designate character set - skip next byte
                        self.state = .ground;
                    },
                    '7' => { // DECSC - Save Cursor
                        self.saved_cursor_col = self.cursor_col;
                        self.saved_cursor_row = self.cursor_row;
                        self.state = .ground;
                    },
                    '8' => { // DECRC - Restore Cursor
                        self.cursor_col = self.saved_cursor_col;
                        self.cursor_row = self.saved_cursor_row;
                        self.dirty = true;
                        self.state = .ground;
                    },
                    'M' => { // Reverse Index (scroll down)
                        if (self.cursor_row == 0) {
                            // Scroll down: insert blank line at top
                            const stride = @as(usize, self.cols);
                            const total = stride * @as(usize, self.rows);
                            std.mem.copyBackwards(Cell, self.cells[stride..total], self.cells[0 .. total - stride]);
                            @memset(self.cells[0..stride], Cell{});
                        } else {
                            self.cursor_row -= 1;
                        }
                        self.dirty = true;
                        self.state = .ground;
                    },
                    'c' => { // Full Reset
                        @memset(self.cells, Cell{});
                        self.cursor_col = 0;
                        self.cursor_row = 0;
                        self.current_fg = default_fg;
                        self.current_bg = default_bg;
                        self.current_attrs = .{};
                        self.dirty = true;
                        self.state = .ground;
                    },
                    else => self.state = .ground,
                }
            },
            .csi => {
                if (byte >= '0' and byte <= '9') {
                    if (self.param_count == 0) self.param_count = 1;
                    self.params[self.param_count - 1] = self.params[self.param_count - 1] *| 10 +| (byte - '0');
                } else if (byte == ';') {
                    if (self.param_count < self.params.len) {
                        self.param_count += 1;
                    }
                } else if (byte == '?' or byte == '>' or byte == '!') {
                    self.intermediate = byte;
                } else if (byte >= 0x40 and byte <= 0x7e) {
                    // Final byte
                    self.handleCSI(byte);
                    self.state = .ground;
                } else if (byte == 0x1b) {
                    // ESC interrupts CSI
                    self.state = .escape;
                    self.param_count = 0;
                    self.params = [_]u16{0} ** 16;
                    self.intermediate = 0;
                } else {
                    // Unexpected byte, abort CSI
                    self.state = .ground;
                }
            },
            .osc => {
                if (byte == ';') {
                    self.state = .osc_string;
                } else if (byte >= '0' and byte <= '9') {
                    // OSC parameter number - accumulate but we don't use it
                } else if (byte == 0x07) { // BEL terminates OSC
                    self.state = .ground;
                } else if (byte == 0x1b) {
                    self.state = .escape; // Could be ST (ESC \)
                } else {
                    self.state = .osc_string;
                }
            },
            .osc_string => {
                if (byte == 0x07) { // BEL terminates
                    self.state = .ground;
                } else if (byte == 0x1b) {
                    // Might be ESC \ (ST)
                    self.state = .ground;
                }
                // Otherwise consume and ignore the string
            },
        }
    }
};
