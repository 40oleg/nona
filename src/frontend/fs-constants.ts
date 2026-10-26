// fs.constants per platform (#487), in Node.js 26's property order. The
// compiler builds the object so node:fs holds a plain literal: builtin pruning
// can then drop it, and the module does not read process.platform.

type Entry = [string, number];

const fsPosixCommon: Entry[] = [
    ["UV_FS_SYMLINK_DIR", 1],
    ["UV_FS_SYMLINK_JUNCTION", 2],
    ["O_RDONLY", 0],
    ["O_WRONLY", 1],
    ["O_RDWR", 2],
    ["UV_DIRENT_UNKNOWN", 0],
    ["UV_DIRENT_FILE", 1],
    ["UV_DIRENT_DIR", 2],
    ["UV_DIRENT_LINK", 3],
    ["UV_DIRENT_FIFO", 4],
    ["UV_DIRENT_SOCKET", 5],
    ["UV_DIRENT_CHAR", 6],
    ["UV_DIRENT_BLOCK", 7],
    ["S_IFMT", 61440],
    ["S_IFREG", 32768],
    ["S_IFDIR", 16384],
    ["S_IFCHR", 8192],
    ["S_IFBLK", 24576],
    ["S_IFIFO", 4096],
    ["S_IFLNK", 40960],
    ["S_IFSOCK", 49152],
];
const fsPosixModes: Entry[] = [
    ["S_IRWXU", 448],
    ["S_IRUSR", 256],
    ["S_IWUSR", 128],
    ["S_IXUSR", 64],
    ["S_IRWXG", 56],
    ["S_IRGRP", 32],
    ["S_IWGRP", 16],
    ["S_IXGRP", 8],
    ["S_IRWXO", 7],
    ["S_IROTH", 4],
    ["S_IWOTH", 2],
    ["S_IXOTH", 1],
];
const fsAccessAndCopy: Entry[] = [
    ["F_OK", 0],
    ["R_OK", 4],
    ["W_OK", 2],
    ["X_OK", 1],
    ["UV_FS_COPYFILE_EXCL", 1],
    ["COPYFILE_EXCL", 1],
    ["UV_FS_COPYFILE_FICLONE", 2],
    ["COPYFILE_FICLONE", 2],
    ["UV_FS_COPYFILE_FICLONE_FORCE", 4],
    ["COPYFILE_FICLONE_FORCE", 4],
];
// Open flags in Node.js order; a flag a platform lacks is omitted.
function fsOpenFlags(v: Record<string, number>): Entry[] {
    const names = [
        "O_CREAT",
        "O_EXCL",
        "UV_FS_O_FILEMAP",
        "UV_FS_O_TEMPORARY",
        "UV_FS_O_SHORT_LIVED",
        "UV_FS_O_SEQUENTIAL",
        "UV_FS_O_RANDOM",
        "O_NOCTTY",
        "O_TRUNC",
        "O_APPEND",
        "O_DIRECTORY",
        "O_NOATIME",
        "O_NOFOLLOW",
        "O_SYNC",
        "O_DSYNC",
        "O_SYMLINK",
        "O_DIRECT",
        "O_NONBLOCK",
    ];
    const out: Entry[] = [];
    for (const name of names) if (name in v) out.push([name, v[name]!]);
    return out;
}
function fsConstantEntries(fsPlatform: string): Entry[] {
    if (fsPlatform === "win32") {
        return [
            ["UV_FS_SYMLINK_DIR", 1],
            ["UV_FS_SYMLINK_JUNCTION", 2],
            ["O_RDONLY", 0],
            ["O_WRONLY", 1],
            ["O_RDWR", 2],
            ["UV_DIRENT_UNKNOWN", 0],
            ["UV_DIRENT_FILE", 1],
            ["UV_DIRENT_DIR", 2],
            ["UV_DIRENT_LINK", 3],
            ["UV_DIRENT_FIFO", 4],
            ["UV_DIRENT_SOCKET", 5],
            ["UV_DIRENT_CHAR", 6],
            ["UV_DIRENT_BLOCK", 7],
            ["S_IFMT", 61440],
            ["S_IFREG", 32768],
            ["S_IFDIR", 16384],
            ["S_IFCHR", 8192],
            ["S_IFIFO", 4096],
            ["S_IFLNK", 40960],
            ...fsOpenFlags({
                O_CREAT: 256,
                O_EXCL: 1024,
                UV_FS_O_FILEMAP: 536870912,
                UV_FS_O_TEMPORARY: 64,
                UV_FS_O_SHORT_LIVED: 4096,
                UV_FS_O_SEQUENTIAL: 32,
                UV_FS_O_RANDOM: 16,
                O_TRUNC: 512,
                O_APPEND: 8,
                O_SYNC: 134217728,
                O_DSYNC: 67108864,
                O_DIRECT: 33554432,
            }),
            ["S_IRUSR", 256],
            ["S_IWUSR", 128],
            ...fsAccessAndCopy,
        ];
    }
    let flags: Record<string, number>;
    if (fsPlatform === "darwin") {
        flags = {
            O_CREAT: 512,
            O_EXCL: 2048,
            UV_FS_O_FILEMAP: 0,
            UV_FS_O_TEMPORARY: 0,
            UV_FS_O_SHORT_LIVED: 0,
            UV_FS_O_SEQUENTIAL: 0,
            UV_FS_O_RANDOM: 0,
            O_NOCTTY: 131072,
            O_TRUNC: 1024,
            O_APPEND: 8,
            O_DIRECTORY: 1048576,
            O_NOFOLLOW: 256,
            O_SYNC: 128,
            O_DSYNC: 4194304,
            O_SYMLINK: 2097152,
            O_NONBLOCK: 4,
        };
    } else if (fsPlatform === "freebsd") {
        flags = {
            O_CREAT: 512,
            O_EXCL: 2048,
            UV_FS_O_FILEMAP: 0,
            UV_FS_O_TEMPORARY: 0,
            UV_FS_O_SHORT_LIVED: 0,
            UV_FS_O_SEQUENTIAL: 0,
            UV_FS_O_RANDOM: 0,
            O_NOCTTY: 32768,
            O_TRUNC: 1024,
            O_APPEND: 8,
            O_DIRECTORY: 131072,
            O_NOFOLLOW: 256,
            O_SYNC: 128,
            O_DSYNC: 16777216,
            O_DIRECT: 65536,
            O_NONBLOCK: 4,
        };
    } else if (fsPlatform === "openbsd") {
        flags = {
            O_CREAT: 512,
            O_EXCL: 2048,
            UV_FS_O_FILEMAP: 0,
            UV_FS_O_TEMPORARY: 0,
            UV_FS_O_SHORT_LIVED: 0,
            UV_FS_O_SEQUENTIAL: 0,
            UV_FS_O_RANDOM: 0,
            O_NOCTTY: 32768,
            O_TRUNC: 1024,
            O_APPEND: 8,
            O_DIRECTORY: 131072,
            O_NOFOLLOW: 256,
            O_SYNC: 128,
            O_DSYNC: 128,
            O_NONBLOCK: 4,
        };
    } else {
        flags = {
            O_CREAT: 64,
            O_EXCL: 128,
            UV_FS_O_FILEMAP: 0,
            UV_FS_O_TEMPORARY: 0,
            UV_FS_O_SHORT_LIVED: 0,
            UV_FS_O_SEQUENTIAL: 0,
            UV_FS_O_RANDOM: 0,
            O_NOCTTY: 256,
            O_TRUNC: 512,
            O_APPEND: 1024,
            O_DIRECTORY: 65536,
            O_NOATIME: 262144,
            O_NOFOLLOW: 131072,
            O_SYNC: 1052672,
            O_DSYNC: 4096,
            O_DIRECT: 16384,
            O_NONBLOCK: 2048,
        };
    }
    return [
        ...fsPosixCommon,
        ...fsOpenFlags(flags),
        ...fsPosixModes,
        ...fsAccessAndCopy,
    ];
}

/** The `fs.constants` object for a platform name (`process.platform`). */
export function fsConstants(platform: string): Record<string, number> {
    return Object.fromEntries(fsConstantEntries(platform));
}
