import fs from "node:fs";
const promises = fs.promises;
export default promises;
export const readFile = promises.readFile,
    writeFile = promises.writeFile,
    appendFile = promises.appendFile,
    access = promises.access,
    stat = promises.stat,
    lstat = promises.lstat,
    readlink = promises.readlink,
    realpath = promises.realpath,
    readdir = promises.readdir,
    mkdir = promises.mkdir,
    rm = promises.rm,
    rmdir = promises.rmdir,
    unlink = promises.unlink,
    rename = promises.rename,
    truncate = promises.truncate,
    copyFile = promises.copyFile,
    symlink = promises.symlink,
    constants = fs.constants;
