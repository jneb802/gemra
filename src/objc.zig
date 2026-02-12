// Thin Objective-C runtime wrapper for Zig.
// Uses @cImport on <objc/runtime.h> and <objc/message.h>.

const std = @import("std");

pub const c = @cImport({
    @cInclude("objc/runtime.h");
    @cInclude("objc/message.h");
});

pub const id = ?*anyopaque;
pub const SEL = c.SEL;
pub const Class = c.Class;
pub const BOOL = c.BOOL;
pub const YES: BOOL = true;
pub const NO: BOOL = false;
pub const NSUInteger = u64;
pub const NSInteger = i64;
pub const CGFloat = f64;
pub const IMP = *const fn () callconv(.C) void;

pub const CGRect = extern struct {
    origin: CGPoint,
    size: CGSize,
};

pub const CGPoint = extern struct {
    x: CGFloat,
    y: CGFloat,
};

pub const CGSize = extern struct {
    width: CGFloat,
    height: CGFloat,
};

pub const NSRect = CGRect;
pub const NSPoint = CGPoint;
pub const NSSize = CGSize;

pub fn getClass(name: [*:0]const u8) Class {
    return c.objc_getClass(name) orelse @panic("objc_getClass failed");
}

pub fn sel(name: [*:0]const u8) SEL {
    return c.sel_registerName(name) orelse @panic("sel_registerName failed");
}

pub fn alloc(cls: Class) id {
    return msgSend(id, @as(id, @ptrCast(cls)), sel("alloc"), .{});
}

// Generic msgSend that casts to the right function pointer type.
pub fn msgSend(comptime ReturnType: type, target: id, selector: SEL, args: anytype) ReturnType {
    const ArgsTuple = @TypeOf(args);
    const FnType = comptime blk: {
        const args_info = @typeInfo(ArgsTuple).@"struct".fields;
        var params: [args_info.len + 2]std.builtin.Type.Fn.Param = undefined;
        params[0] = .{ .is_generic = false, .is_noalias = false, .type = id };
        params[1] = .{ .is_generic = false, .is_noalias = false, .type = SEL };
        for (args_info, 0..) |arg, i| {
            params[i + 2] = .{ .is_generic = false, .is_noalias = false, .type = arg.type };
        }
        break :blk *const @Type(.{ .@"fn" = .{
            .calling_convention = std.builtin.CallingConvention.c,
            .is_generic = false,
            .is_var_args = false,
            .return_type = ReturnType,
            .params = &params,
        } });
    };

    const func: FnType = @ptrCast(&c.objc_msgSend);
    return @call(.auto, func, .{ target, selector } ++ args);
}

// msgSend variant for methods returning structs (uses objc_msgSend_stret on some archs).
// On arm64, structs are returned in registers via regular objc_msgSend, so this is the same.
pub fn msgSendStret(comptime ReturnType: type, target: id, selector: SEL, args: anytype) ReturnType {
    // On arm64 macOS, objc_msgSend handles struct returns directly
    return msgSend(ReturnType, target, selector, args);
}

// Convenience for sending messages that return void.
pub fn msgSendVoid(target: id, selector: SEL, args: anytype) void {
    _ = msgSend(void, target, selector, args);
}

// Convenience for "[[Class alloc] init]"
pub fn allocInit(class_name: [*:0]const u8) id {
    const cls = getClass(class_name);
    const obj = alloc(cls);
    return msgSend(id, obj, sel("init"), .{});
}

// Register a new ObjC class at runtime.
pub fn allocateClassPair(superclass: Class, name: [*:0]const u8) Class {
    return c.objc_allocateClassPair(superclass, name, 0) orelse @panic("objc_allocateClassPair failed");
}

pub fn registerClassPair(cls: Class) void {
    c.objc_registerClassPair(cls);
}

pub fn addMethod(cls: Class, name: SEL, imp: IMP, types: [*:0]const u8) void {
    if (!c.class_addMethod(cls, name, imp, types)) {
        @panic("class_addMethod failed");
    }
}

pub fn addIvar(cls: Class, name: [*:0]const u8, size: usize, alignment: u8, types: [*:0]const u8) void {
    if (!c.class_addIvar(cls, name, size, alignment, types)) {
        @panic("class_addIvar failed");
    }
}

pub fn getInstanceVariable(cls: Class, name: [*:0]const u8) c.Ivar {
    return c.class_getInstanceVariable(cls, name) orelse @panic("class_getInstanceVariable failed");
}

pub fn ivarGetOffset(ivar: c.Ivar) isize {
    return c.ivar_getOffset(ivar);
}

pub fn setIvarValue(obj: id, ivar_name: [*:0]const u8, cls: Class, value: *anyopaque) void {
    const ivar = getInstanceVariable(cls, ivar_name);
    const offset = ivarGetOffset(ivar);
    const base: [*]u8 = @ptrCast(obj.?);
    const slot: *?*anyopaque = @ptrCast(@alignCast(base + @as(usize, @intCast(offset))));
    slot.* = value;
}

pub fn getIvarValue(comptime T: type, obj: id, ivar_name: [*:0]const u8, cls: Class) T {
    const ivar = getInstanceVariable(cls, ivar_name);
    const offset = ivarGetOffset(ivar);
    const base: [*]const u8 = @ptrCast(obj.?);
    const slot: *const T = @ptrCast(@alignCast(base + @as(usize, @intCast(offset))));
    return slot.*;
}
