const std = @import("std");
const posix = std.posix;

const c = @cImport({
    @cInclude("util.h");
    @cInclude("unistd.h");
    @cInclude("sys/ioctl.h");
    @cInclude("termios.h");
    @cInclude("signal.h");
    @cInclude("sys/wait.h");
    @cInclude("pwd.h");
    @cInclude("stdlib.h");
});

pub const Pty = struct {
    master_fd: posix.fd_t,
    slave_fd: posix.fd_t,
    child_pid: posix.pid_t,

    pub fn spawn(cols: u16, rows: u16) !Pty {
        var master: posix.fd_t = undefined;
        var slave: posix.fd_t = undefined;

        // Set initial window size
        var ws: c.struct_winsize = .{
            .ws_col = cols,
            .ws_row = rows,
            .ws_xpixel = 0,
            .ws_ypixel = 0,
        };

        if (c.openpty(&master, &slave, null, null, &ws) != 0) {
            return error.OpenPtyFailed;
        }
        errdefer {
            posix.close(master);
            posix.close(slave);
        }

        const pid = try posix.fork();
        if (pid == 0) {
            // Child process
            posix.close(master);

            // Create new session
            if (c.setsid() < 0) posix.exit(1);

            // Set controlling terminal
            if (c.ioctl(slave, c.TIOCSCTTY, @as(c_int, 0)) < 0) posix.exit(1);

            // Dup slave to stdin/stdout/stderr
            posix.dup2(slave, 0) catch posix.exit(1);
            posix.dup2(slave, 1) catch posix.exit(1);
            posix.dup2(slave, 2) catch posix.exit(1);
            if (slave > 2) posix.close(slave);

            // Set TERM
            _ = c.setenv("TERM", "xterm-256color", 1);
            _ = c.setenv("COLORTERM", "truecolor", 1);

            // Get user's default shell
            const shell = getDefaultShell();

            // Exec the shell using execvp (inherits environment)
            var argv0 = [_:null]?[*:0]u8{@constCast(shell)};
            _ = c.execvp(shell, @ptrCast(&argv0));

            // If execvp fails, try /bin/zsh, then /bin/sh
            var zsh_argv = [_:null]?[*:0]u8{@constCast(@as([*:0]const u8, "/bin/zsh"))};
            _ = c.execvp("/bin/zsh", @ptrCast(&zsh_argv));

            var sh_argv = [_:null]?[*:0]u8{@constCast(@as([*:0]const u8, "/bin/sh"))};
            _ = c.execvp("/bin/sh", @ptrCast(&sh_argv));

            posix.exit(1);
        }

        // Parent process
        posix.close(slave);

        return Pty{
            .master_fd = master,
            .slave_fd = -1, // closed in parent
            .child_pid = pid,
        };
    }

    pub fn read(self: *Pty, buf: []u8) !usize {
        const result = posix.read(self.master_fd, buf);
        return result catch |err| {
            if (err == error.WouldBlock) return 0;
            return err;
        };
    }

    pub fn write(self: *Pty, data: []const u8) !usize {
        return posix.write(self.master_fd, data);
    }

    pub fn setSize(self: *Pty, cols: u16, rows: u16) void {
        var ws: c.struct_winsize = .{
            .ws_col = cols,
            .ws_row = rows,
            .ws_xpixel = 0,
            .ws_ypixel = 0,
        };
        _ = c.ioctl(self.master_fd, c.TIOCSWINSZ, &ws);
    }

    pub fn close(self: *Pty) void {
        posix.close(self.master_fd);
        _ = c.kill(self.child_pid, c.SIGHUP);
        _ = c.waitpid(self.child_pid, null, c.WNOHANG);
    }

    pub fn isAlive(self: *Pty) bool {
        var status: c_int = 0;
        const result = c.waitpid(self.child_pid, &status, c.WNOHANG);
        return result == 0;
    }
};

fn getDefaultShell() [*:0]const u8 {
    // Try SHELL env var first
    const shell_env = c.getenv("SHELL");
    if (shell_env) |s| return s;

    // Try passwd entry
    const pw = c.getpwuid(c.getuid());
    if (pw) |p| {
        if (p.*.pw_shell) |s| return s;
    }

    return "/bin/zsh";
}
