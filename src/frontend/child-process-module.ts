import { patchSource } from "../source-patch.js";
import {
    modulesChildProcessUnsupported,
    modulesChildProcessCommon,
    modulesChildProcessWin32,
    modulesChildProcessLinux,
    modulesChildProcessDarwin,
    modulesChildProcessBsd,
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
 * macOS layer (darwin-x64, darwin-arm64): libSystem calls through nona:ffi
 * (fork and pipe return a second value that raw system calls through the FFI
 * lose). The parent resolves the file against PATH like the Linux layer and
 * calls posix_spawn on each candidate with execvp's rules; posix_spawn reports
 * exec failures itself. File actions dup2 the child's pipe ends, open
 * /dev/null for 'ignore', mark inherited descriptors (addinherit_np) and
 * change directory (addchdir_np); the attributes reset signal dispositions
 * and the mask, start a session for `detached` and close every other
 * descriptor in the child (POSIX_SPAWN_CLOEXEC_DEFAULT). argv and envp are
 * laid out for an address malloc returns and copied there with memcpy.
 * Readiness uses poll(2) on the pipe ends and on one kqueue per child with an
 * EVFILT_PROC/NOTE_EXIT event, or a 10 ms waitpid poll when the event cannot
 * be registered. The parent's stdin end has F_SETNOSIGPIPE, and writes also
 * block SIGPIPE and consume a pending one. fcntl, which is variadic, is a raw
 * system call. Darwin errno values and signal numbers are translated to and
 * from the contract's Linux numbers; sys.errno returns libuv's negative Darwin
 * errno values.
 *
 * BSD layer (freebsd-x64, openbsd-x64): the Linux layer's design with raw
 * BSD system calls (src/lib/modules/child-process-bsd.js, written for
 * FreeBSD; openbsdSource derives OpenBSD). The FFI stub turns the carry-flag
 * errors into negative BSD errno values, which the layer translates to the
 * contract's Linux numbers. fork returns 0 in the child's rax on both kernels,
 * and the child exits with exit(2). Readiness uses poll(2) on the pipe ends and
 * on one kqueue per child with an EVFILT_PROC/NOTE_EXIT event, or a 10 ms
 * wait4 poll when the event cannot be registered. OpenBSD's sigprocmask takes
 * the mask by value and returns the old one; a pending SIGPIPE is consumed
 * with sigtimedwait (FreeBSD) or __thrsigdivert (OpenBSD). Signal numbers and
 * errno values are translated like on macOS; sys.errno returns libuv's
 * negative BSD errno values.
 *
 * Every current target has a layer; a target without one (a future NetBSD or
 * other architecture) gets a stub whose functions throw ERR_NONA_UNSUPPORTED.
 */
const common = modulesChildProcessCommon;

const win32 = modulesChildProcessWin32;

const linux = modulesChildProcessLinux;

const darwin = modulesChildProcessDarwin;

const bsd = modulesChildProcessBsd;

/** The `const name = define("syscall", ...)` statement of a raw system call layer. */
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
            'const ppoll = define("syscall", "73", "i64(buf,i64,buf,buf,i64)"),pollTime = new Uint32Array(4);' +
            "function sysPoll(fds,count,timeout){if(timeout<0)return ppoll(fds,count,null,null,8);" +
            "const seconds=Math.floor(timeout/1000);pollTime[0]=seconds;" +
            "pollTime[2]=Math.floor((timeout-seconds*1000)*1000000);return ppoll(fds,count,pollTime,null,8)}",
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

/**
 * OpenBSD from child-process-bsd.js (written for FreeBSD): other numbers for
 * wait4, kill, pipe2, poll, mmap, sigaction, kqueue and kevent, other
 * O_CLOEXEC and F_DUPFD_CLOEXEC values, sigprocmask with the mask passed by
 * value and the old mask returned, and __thrsigdivert for sigtimedwait.
 */
function openbsdSource(): string {
    let source = bsd;
    const numbers: Record<string, string> = {
        sysWait4: "11",
        sysKill: "122",
        sysPipe2: "101",
        sysPoll: "252",
        sysMmap: "49",
        sysSigaction: "46",
        sysKqueue: "269",
        sysKevent: "72",
    };
    for (const [name, number] of Object.entries(numbers))
        source = patchSource(source, syscallDefinition(name), (statement) =>
            statement.replace(/"\d+"/, `"${number}"`),
        );
    const replacements: Record<string, string> = {
        // A null set reads the mask (SIG_BLOCK with no signals).
        sysSigprocmask:
            'const sigprocmask = define("syscall", "48", "i64(i64,i64)");' +
            "function sysSigprocmask(how,set,old){const result=set===null?sigprocmask(1,0):sigprocmask(how,set[0]);" +
            "if(result>=0&&old!==null)old[0]=result;return result<0?result:0}",
        sysSigtimedwait:
            'const thrsigdivert = define("syscall", "303", "i64(i64,buf,buf)");function sysSigtimedwait(set,info,timeout){return thrsigdivert(set[0],info,timeout)}',
    };
    for (const [name, statements] of Object.entries(replacements))
        source = patchSource(source, syscallDefinition(name), statements);
    source = patchSource(
        source,
        'const platform = "freebsd";',
        'const platform = "openbsd";',
    );
    source = patchSource(source, "O_CLOEXEC = 0x100000", "O_CLOEXEC = 0x10000");
    source = patchSource(
        source,
        "F_DUPFD_CLOEXEC = 17",
        "F_DUPFD_CLOEXEC = 10",
    );
    return source;
}

/** Platform layers by target; other targets get the stub whose functions throw ERR_NONA_UNSUPPORTED. */
const layers: Record<string, () => string> = {
    "win32-x64": () => win32,
    "win32-arm64": () => win32,
    "linux-x64": () => linux,
    "linux-arm64": linuxArm64Source,
    "darwin-x64": () => darwin,
    "darwin-arm64": () => darwin,
    "freebsd-x64": () => bsd,
    "openbsd-x64": openbsdSource,
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
