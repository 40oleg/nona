const env = process.env;
const platformName = process.platform;
export const EOL = platformName === "win32" ? "\r\n" : "\n";
export const devNull = platformName === "win32" ? "\\\\.\\nul" : "/dev/null";
export function platform() {
    return platformName;
}
export function arch() {
    return process.arch;
}
export function machine() {
    return process.arch === "x64"
        ? "x86_64"
        : process.arch === "arm64"
          ? platformName === "win32"
              ? "arm64"
              : "aarch64"
          : process.arch;
}
export function type() {
    return platformName === "win32"
        ? "Windows_NT"
        : platformName === "darwin"
          ? "Darwin"
          : platformName === "freebsd"
            ? "FreeBSD"
            : platformName === "openbsd"
              ? "OpenBSD"
              : "Linux";
}
export function release() {
    return "";
}
export function version() {
    return "";
}
export function endianness() {
    return "LE";
}
export function homedir() {
    return (platformName === "win32" ? env.USERPROFILE : env.HOME) || "";
}
export function tmpdir() {
    if (platformName === "win32") {
        let path =
            env.TEMP ||
            env.TMP ||
            (env.SystemRoot || env.windir || "C:\\Windows") + "\\temp";
        if (path.length > 1 && path.endsWith("\\") && !path.endsWith(":\\"))
            path = path.slice(0, -1);
        return path;
    }
    let path = env.TMPDIR || env.TMP || env.TEMP || "/tmp";
    if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
    return path;
}
export function hostname() {
    return env.HOSTNAME || env.COMPUTERNAME || "localhost";
}
export function uptime() {
    return process.uptime();
}
export function loadavg() {
    return [0, 0, 0];
}
export function cpus() {
    return [];
}
export function availableParallelism() {
    return 1;
}
export function totalmem() {
    const value =
        typeof process.constrainedMemory === "function"
            ? process.constrainedMemory()
            : 0;
    return value || 0;
}
export function freemem() {
    return typeof process.availableMemory === "function"
        ? process.availableMemory()
        : 0;
}
export function networkInterfaces() {
    return {};
}
export function userInfo() {
    return {
        uid: typeof process.getuid === "function" ? process.getuid() : -1,
        gid: typeof process.getgid === "function" ? process.getgid() : -1,
        username: env.USER || env.USERNAME || env.LOGNAME || "",
        homedir: homedir(),
        shell: platformName === "win32" ? null : env.SHELL || null,
    };
}
export function getPriority() {
    return 0;
}
export function setPriority() {}
export const constants = Object.freeze({
    signals: Object.freeze({
        SIGHUP: 1,
        SIGINT: 2,
        SIGQUIT: 3,
        SIGILL: 4,
        SIGTRAP: 5,
        SIGABRT: 6,
        SIGBUS: 7,
        SIGFPE: 8,
        SIGKILL: 9,
        SIGUSR1: 10,
        SIGSEGV: 11,
        SIGUSR2: 12,
        SIGPIPE: 13,
        SIGALRM: 14,
        SIGTERM: 15,
        SIGCHLD: 17,
        SIGCONT: 18,
        SIGSTOP: 19,
        SIGTSTP: 20,
        SIGWINCH: 28,
    }),
    errno: Object.freeze({}),
    priority: Object.freeze({
        PRIORITY_LOW: 19,
        PRIORITY_BELOW_NORMAL: 10,
        PRIORITY_NORMAL: 0,
        PRIORITY_ABOVE_NORMAL: -7,
        PRIORITY_HIGH: -14,
        PRIORITY_HIGHEST: -20,
    }),
});
const os = {
    EOL,
    devNull,
    platform,
    arch,
    machine,
    type,
    release,
    version,
    endianness,
    homedir,
    tmpdir,
    hostname,
    uptime,
    loadavg,
    cpus,
    availableParallelism,
    totalmem,
    freemem,
    networkInterfaces,
    userInfo,
    getPriority,
    setPriority,
    constants,
};
export default os;
