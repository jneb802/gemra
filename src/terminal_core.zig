const std = @import("std");
const zvterm = @import("zvterm");

pub const TerminalCore = struct {
    vterm: *zvterm.ZVTerm,
    rows: u16,
    cols: u16,
    allocator: std.mem.Allocator,

    pub fn init(allocator: std.mem.Allocator, rows: u16, cols: u16) !*TerminalCore {
        var self = try allocator.create(TerminalCore);
        self.* = .{
            .vterm = undefined,
            .rows = rows,
            .cols = cols,
            .allocator = allocator,
        };

        self.vterm = try zvterm.ZVTerm.init(allocator, rows, cols);

        return self;
    }

    pub fn deinit(self: *TerminalCore) void {
        self.vterm.deinit();
        self.allocator.destroy(self);
    }

    pub fn feed(self: *TerminalCore, bytes: []const u8) void {
        self.vterm.write(bytes);
    }

    pub fn resize(self: *TerminalCore, rows: u16, cols: u16) void {
        self.rows = rows;
        self.cols = cols;
        self.vterm.set_size(rows, cols);
    }
};
