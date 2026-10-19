import { patchSource } from "../source-patch.js";
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
 * The Windows layer serves win32-x64 and win32-arm64 (DLL calls through
 * nona:ffi do not depend on the architecture).
 *
 * Linux layer (linux-x64, linux-arm64): raw system calls. The parent resolves the file
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
 * linux-arm64 uses the same source with the asm-generic system calls
 * (linuxArm64Source): openat, ppoll, dup3 and clone(SIGCHLD) stand in for
 * open, poll, dup2 and fork.
 *
 * Other targets (macOS, BSD) get a stub whose functions throw
 * ERR_NONA_UNSUPPORTED.
 */
const common = modulesChildProcessCommon;

const win32 = modulesChildProcessWin32;

const linux = modulesChildProcessLinux;

/** The `const name = define("syscall", ...)` statement of child-process-linux.js. */
function syscallDefinition(name: string): RegExp {
    return new RegExp(
        `const ${name} = define\\("syscall", "\\d+", "[^"]*"\\);`,
    );
}

/**
 * AArch64's asm-generic table: other numbers, *at and p* variants instead of
 * open, poll and dup2, and clone instead of fork. The flags and structures
 * the layer uses are the same as on x86-64.
 */
function linuxArm64Source(): string {
    let source = linux;
    const numbers: Record<string, string> = {
        sysRead: "63",
        sysWrite: "64",
        sysClose: "57",
        sysMmap: "222",
        sysMunmap: "215",
        sysSigaction: "134",
        sysSigprocmask: "135",
        sysReadTo: "63",
        sysExecve: "221",
        sysWait4: "260",
        sysKill: "129",
        sysFcntl: "25",
        sysChdir: "49",
        sysSetsid: "157",
        sysSigtimedwait: "137",
        sysExitGroup: "94",
        sysPipe2: "59",
        sysPidfdOpen: "434",
    };
    for (const [name, number] of Object.entries(numbers))
        source = patchSource(source, syscallDefinition(name), (statement) =>
            statement.replace(/"\d+"/, `"${number}"`),
        );
    const replacements: Record<string, string> = {
        sysOpen:
            'const openat = define("syscall", "56", "i64(i64,buf,i64,i64)");function sysOpen(path,flags,mode){return openat(-100,path,flags,mode)}',
        // ppoll takes a timespec (NULL: no limit) and a signal mask (NULL: unchanged).
        sysPoll:
            'const ppoll = define("syscall", "73", "i64(buf,i64,buf,buf,i64)"),pollTime = new Uint32Array(4);function sysPoll(fds,count,timeout){if(timeout<0)return ppoll(fds,count,null,null,8);const seconds=Math.floor(timeout/1000);pollTime[0]=seconds;pollTime[2]=Math.floor((timeout-seconds*1000)*1000000);return ppoll(fds,count,pollTime,null,8)}',
        // dup3 fails with EINVAL when both descriptors are equal; dup2 would
        // keep the descriptor, which the child needs without FD_CLOEXEC.
        sysDup2:
            'const dup3 = define("syscall", "24", "i64(i64,i64,i64)");function sysDup2(from,to){return from===to?sysFcntl(to,2,0):dup3(from,to,0)}',
        // clone(SIGCHLD, no new stack, ...) is fork.
        sysFork:
            'const clone = define("syscall", "220", "i64(i64,i64,i64,i64,i64)");function sysFork(){return clone(17,0,0,0,0)}',
    };
    for (const [name, statements] of Object.entries(replacements))
        source = patchSource(source, syscallDefinition(name), statements);
    return source;
}

/** Platform layers by target; other targets get the stub whose functions throw ERR_NONA_UNSUPPORTED. */
const layers: Record<string, () => string> = {
    "win32-x64": () => win32,
    "win32-arm64": () => win32,
    "linux-x64": () => linux,
    "linux-arm64": linuxArm64Source,
};

/** Targets with a node:child_process platform layer. */
export const childProcessTargets: readonly string[] = Object.freeze(
    Object.keys(layers),
);

export function childProcessModuleSource(target: string): string {
    const layer = Object.hasOwn(layers, target) ? layers[target] : undefined;
    return layer === undefined
        ? modulesChildProcessUnsupported
        : layer() + common;
}
