import {
    modulesChildProcessUnsupported,
    modulesChildProcessCommon,
    modulesChildProcessWin32,
    modulesChildProcessLinux,
} from "../lib/sources.generated.js";
/**
 * Source of the built-in `node:child_process` module (aliases
 * `child_process` and `nona:child_process`). As in node:net, a small
 * platform layer sits under a shared JavaScript implementation
 * (src/lib/modules/child-process-common.js) that provides ChildProcess,
 * spawn, exec, execFile and their synchronous variants. Child stdio pipes are
 * watched by the host event loop: the module registers a poller with it
 * through `__nonaIoLoop`, next to the one of node:net.
 *
 * Platform layer contract (`sys`, defined before the shared code). Errors are
 * negative Linux errno values (Windows errors are translated); the shared code
 * turns them into Node.js-style errors (`code`, `errno` through sys.errno,
 * `syscall` 'spawn <file>', `path`, `spawnargs`).
 *
 * - `sys.spawn(request)` starts a process. `request` is
 *   `{file, args, cwd, envPairs, stdio, detached, windowsHide,
 *   windowsVerbatimArguments}`: `args` includes argv[0], `envPairs` is a list
 *   of `KEY=value` strings, `stdio` has three entries `'pipe'`, `'inherit'` or
 *   `'ignore'`. It returns `{pid, process, stdio: [h0, h1, h2]}`, where the
 *   handles of piped streams are the parent's pipe ends (stdin is writable,
 *   stdout and stderr readable) and the others are -1, or a negative errno.
 *   The parent's pipe ends are non-blocking.
 * - `sys.read(handle, buffer)` reads at most buffer.length bytes without
 *   blocking: the byte count, 0 at end of file, -EAGAIN when no data is ready.
 * - `sys.write(handle, bytes, offset, length)` writes without blocking: the
 *   byte count (possibly partial), -EAGAIN when the pipe is full, -EPIPE when
 *   the reader is gone.
 * - `sys.close(handle)` closes a pipe end.
 * - `sys.kill(process, signal)` sends a signal (a Linux signal number; 0 only
 *   checks that the process runs): 0 or a negative errno (-ESRCH once it has
 *   exited, -ENOSYS for a signal the platform cannot deliver).
 * - `sys.reap(process)` returns null while the process runs, else
 *   `{exitCode, signal}` (signal is a Linux signal number or 0). It does not
 *   release the process; `sys.release(process)` does.
 * - `sys.poll(targets, timeout)` waits until one of the targets is ready or
 *   timeout milliseconds have passed (-1: no limit) and returns the indices of
 *   the ready ones. A target is `{handle, kind}` with kind READ (1, a readable
 *   pipe has data or reached end of file), WRITE (2, a writable pipe may
 *   accept data) or EXIT (4, handle is the `process` value of sys.spawn and
 *   the process may have exited). The layer also defines READ, WRITE and EXIT.
 *   Spurious readiness is allowed; the shared code retries.
 * - `sys.errno(errno, code)` is the `errno` property for an error code
 *   (libuv's numbers: negative errno on Linux, UV_E* on Windows).
 * - `sys.platform` is `'win32'` or a POSIX platform name; it selects the
 *   default shell (`cmd.exe /d /s /c "..."` or `/bin/sh -c`).
 *
 * spawnSync runs on the same functions: it writes the input, drains stdout
 * and stderr as they become readable and waits with sys.poll, so a child that
 * fills both pipes cannot deadlock it.
 *
 * Windows layer: CreateProcessW with anonymous pipes. Anonymous pipes cannot
 * be waited for, so readiness is polled: PeekNamedPipe tells whether a pipe
 * has data or is closed, the parent's stdin end is in PIPE_NOWAIT mode, and
 * between polls the layer waits on the process handles (or sleeps) for a
 * short, growing slice (1 to 16 ms).
 *
 * Linux layer (linux-x64): raw system calls. The parent resolves the file
 * against PATH (execvp's candidate list), maps the argv and envp arrays into
 * anonymous memory whose address it knows (JavaScript cannot take the address
 * of its own buffers, so the bytes are copied in through a pipe), creates
 * O_CLOEXEC pipes and an error pipe, blocks signals and forks. Between fork
 * and execve the child runs only system calls on numbers and preallocated
 * buffers: it resets signal dispositions and the mask, dup2s its stdio,
 * changes directory and tries execve on each candidate; on failure it writes
 * the negative errno to the error pipe and exits with 127. EOF on the error
 * pipe tells the parent that execve succeeded. Readiness uses poll(2) on the
 * non-blocking parent pipe ends and on a pidfd (pidfd_open), or a 10 ms wait4
 * poll on kernels without pidfd. Writes block SIGPIPE and consume a pending
 * one, so a closed child stdin fails with EPIPE instead of killing the parent.
 */
const common = modulesChildProcessCommon;

const win32 = modulesChildProcessWin32;

/** Platform layers by target; other targets get the stub whose functions throw ERR_NONA_UNSUPPORTED. */
const layers: Record<string, string> = {
    "win32-x64": win32,
    "linux-x64": modulesChildProcessLinux,
};

export function childProcessModuleSource(target: string): string {
    const layer = layers[target];
    return layer === undefined
        ? modulesChildProcessUnsupported
        : layer + common;
}
