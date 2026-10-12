
function unsupported(name) {
  return function () {
    const error = new Error(name + ' is not supported by Nona');
    error.code = 'ERR_NONA_UNSUPPORTED';
    throw error;
  };
}

export const spawn = unsupported('child_process.spawn'), spawnSync = unsupported('child_process.spawnSync'), exec = unsupported('child_process.exec'), execSync = unsupported('child_process.execSync');
export const execFile = unsupported('child_process.execFile'), execFileSync = unsupported('child_process.execFileSync'), fork = unsupported('child_process.fork');
export class ChildProcess { constructor() { unsupported('child_process.ChildProcess')(); } }
export default {spawn, spawnSync, exec, execSync, execFile, execFileSync, fork, ChildProcess};
