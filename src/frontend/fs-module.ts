import type {Target} from '../target.js';
import {CompileError} from '../diagnostics.js';
/**
 * Source of the built-in `nona:fs` (alias `node:fs`) module: a synchronous
 * subset of Node.js fs. A small platform layer (Win32 through nona:ffi, Linux
 * through raw system calls) sits under a shared JavaScript implementation.
 */
const common=String.raw`
import {resolve,join,dirname} from 'node:path';
const encoder = new TextEncoder(), decoder = new TextDecoder();
const descriptions = {
  ENOENT: 'no such file or directory', EEXIST: 'file already exists', EACCES: 'permission denied',
  EPERM: 'operation not permitted', ENOTDIR: 'not a directory', EISDIR: 'illegal operation on a directory',
  ENOTEMPTY: 'directory not empty', EBUSY: 'resource busy or locked', EINVAL: 'invalid argument',
  EBADF: 'bad file descriptor', EXDEV: 'cross-device link not permitted', EIO: 'i/o error', UNKNOWN: 'unknown error'
};
function fail(code, syscall, path, dest) {
  // Like Node.js, errors of reads and writes on an open file carry no path.
  if (syscall === 'read' || syscall === 'write') path = undefined;
  let message = code + ': ' + (descriptions[code] || descriptions.UNKNOWN) + ', ' + syscall;
  if (path !== undefined) message += " '" + path + "'";
  if (dest !== undefined) message += " -> '" + dest + "'";
  const error = new Error(message);
  error.code = code; error.syscall = syscall;
  if (path !== undefined) error.path = path;
  if (dest !== undefined) error.dest = dest;
  throw error;
}
function pathString(path, name) {
  if (typeof path === 'string') {
    if (path.indexOf('\u0000') >= 0) throw new TypeError('The argument \'' + name + '\' must be a string without null bytes');
    return path;
  }
  if (path instanceof Uint8Array) return decoder.decode(path);
  throw new TypeError('The "' + name + '" argument must be of type string or an instance of Uint8Array');
}
function encodingOf(options) {
  if (typeof options === 'string') return options;
  if (options !== null && typeof options === 'object' && options.encoding != null) return options.encoding;
  return null;
}
function checkEncoding(encoding) {
  if (encoding !== null && encoding !== 'utf8' && encoding !== 'utf-8')
    throw new TypeError('Unsupported encoding: ' + encoding + ' (only utf8 is supported)');
}
function bytesOf(data) {
  if (typeof data === 'string') return encoder.encode(data);
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  throw new TypeError('The "data" argument must be of type string or an instance of Uint8Array, TypedArray or DataView');
}
function concat(chunks, total) {
  const out = new Uint8Array(total);
  let offset = 0;
  for (let i = 0; i < chunks.length; i++) { out.set(chunks[i], offset); offset += chunks[i].length; }
  return out;
}
/** Read until end of file; readInto(view) returns the number of bytes read (0 at the end). */
function readChunks(sizeHint, readInto) {
  const chunks = []; let total = 0, chunk = new Uint8Array(Math.max(sizeHint + 1, 4096)), used = 0;
  for (;;) {
    if (used === chunk.length) { chunks.push(chunk); chunk = new Uint8Array(65536); used = 0; }
    const n = readInto(chunk.subarray(used));
    if (n === 0) break;
    used += n; total += n;
  }
  if (chunks.length === 0) return chunk.slice(0, used);
  chunks.push(chunk.subarray(0, used));
  return concat(chunks, total);
}
class Stats {
  constructor(kind, size, mtimeMs, mode) { this.size = size; this.mtimeMs = mtimeMs; this.mode = mode; this.mtime = new Date(mtimeMs); Object.defineProperty(this, '_kind', {value: kind}); }
  isFile() { return this._kind === 'file'; }
  isDirectory() { return this._kind === 'dir'; }
  isSymbolicLink() { return this._kind === 'link'; }
}
export function readFileSync(path, options) {
  path = pathString(path, 'path');
  const encoding = encodingOf(options); checkEncoding(encoding);
  const bytes = sys.readAll(path);
  return encoding === null ? bytes : decoder.decode(bytes);
}
export function writeFileSync(path, data, options) {
  path = pathString(path, 'path');
  const flag = options !== null && typeof options === 'object' ? options.flag || 'w' : 'w';
  if(flag!=='w'&&flag!=='a'&&flag!=='wx')throw new TypeError('Unsupported file flag: '+flag);
  const mode=options !== null && typeof options === 'object' && options.mode!==undefined?options.mode:0o666;
  sys.writeAll(path, bytesOf(data), flag==='a',flag==='wx',mode);
}
export function appendFileSync(path, data) { sys.writeAll(pathString(path, 'path'), bytesOf(data), true); }
export function existsSync(path) {
  try { return sys.stat(pathString(path, 'path')) !== null; } catch (e) { return false; }
}
export function statSync(path, options) {
  path = pathString(path, 'path');
  const result = sys.stat(path);
  if (result === null) {
    if (options && options.throwIfNoEntry === false) return undefined;
    fail('ENOENT', 'stat', path);
  }
  const value=new Stats(result.kind, result.size, result.mtimeMs, result.mode);
  value.dev=options&&options.bigint?result.dev:Number(result.dev);
  value.ino=options&&options.bigint?result.ino:Number(result.ino);
  return value;
}
export function realpathSync(path) {return sys.realpath(resolve(pathString(path,'path')));}
export function readdirSync(path, options) {
  path = pathString(path, 'path');
  const names = sys.readdir(path);
  if (options && typeof options === 'object' && options.withFileTypes)return names.map(name=>{
    const info=sys.lstat(join(path,name));
    return {name,isDirectory(){return info.kind==='dir'},isFile(){return info.kind==='file'},isSymbolicLink(){return info.kind==='link'}};
  });
  return names;
}
export function mkdirSync(path, options) {
  path = pathString(path, 'path');
  const recursive = options !== null && typeof options === 'object' && !!options.recursive;
  if (!recursive) { sys.mkdir(path); return undefined; }
  const existing = sys.stat(path);
  if (existing !== null) {
    if (existing.kind !== 'dir') fail('EEXIST', 'mkdir', path);
    return undefined;
  }
  // Create missing ancestors first; return the first directory created, like Node.js.
  const parts = [], separator = sys.separator;
  let current = path;
  while (current !== '' && sys.stat(current) === null) {
    parts.push(current);
    const index = Math.max(current.lastIndexOf('/'), separator === '\\' ? current.lastIndexOf('\\') : -1);
    if (index <= 0 || (separator === '\\' && index === 2 && current[1] === ':')) break;
    current = current.slice(0, index);
  }
  for (let i = parts.length - 1; i >= 0; i--) {
    try { sys.mkdir(parts[i]); } catch (e) { if (e.code !== 'EEXIST') throw e; }
  }
  return parts.length ? parts[parts.length - 1] : undefined;
}
export function rmdirSync(path) { sys.rmdir(pathString(path, 'path')); }
export function unlinkSync(path) { sys.unlink(pathString(path, 'path')); }
export function renameSync(from, to) { sys.rename(pathString(from, 'oldPath'), pathString(to, 'newPath')); }
export function copyFileSync(from, to, mode) {
  from = pathString(from, 'src'); to = pathString(to, 'dest');
  if ((mode | 0) & 1 && sys.stat(to) !== null) fail('EEXIST', 'copyfile', from, to);
  sys.copy(from, to);
}
export const constants = { COPYFILE_EXCL: 1, F_OK: 0, R_OK: 4, W_OK: 2, X_OK: 1 };
export default { readFileSync, writeFileSync, appendFileSync, existsSync, statSync, realpathSync, readdirSync, mkdirSync, rmdirSync, unlinkSync, renameSync, copyFileSync, constants };
`;

const win32=String.raw`
import { define, lastError } from 'nona:ffi';
const CreateFileW = define('kernel32.dll', 'CreateFileW', 'ptr(wstr,u32,u32,ptr,u32,u32,ptr)');
const ReadFile = define('kernel32.dll', 'ReadFile', 'bool(ptr,buf,u32,buf,ptr)');
const WriteFile = define('kernel32.dll', 'WriteFile', 'bool(ptr,buf,u32,buf,ptr)');
const GetFileSizeEx = define('kernel32.dll', 'GetFileSizeEx', 'bool(ptr,buf)');
const GetFileInformationByHandle = define('kernel32.dll','GetFileInformationByHandle','bool(ptr,buf)');
const GetFinalPathNameByHandleW = define('kernel32.dll','GetFinalPathNameByHandleW','u32(ptr,buf,u32,u32)');
const CloseHandle = define('kernel32.dll', 'CloseHandle', 'bool(ptr)');
const GetFileAttributesExW = define('kernel32.dll', 'GetFileAttributesExW', 'bool(wstr,u32,buf)');
const CreateDirectoryW = define('kernel32.dll', 'CreateDirectoryW', 'bool(wstr,ptr)');
const RemoveDirectoryW = define('kernel32.dll', 'RemoveDirectoryW', 'bool(wstr)');
const DeleteFileW = define('kernel32.dll', 'DeleteFileW', 'bool(wstr)');
const CopyFileW = define('kernel32.dll', 'CopyFileW', 'bool(wstr,wstr,bool)');
const MoveFileExW = define('kernel32.dll', 'MoveFileExW', 'bool(wstr,wstr,u32)');
const FindFirstFileW = define('kernel32.dll', 'FindFirstFileW', 'ptr(wstr,buf)');
const FindNextFileW = define('kernel32.dll', 'FindNextFileW', 'bool(ptr,buf)');
const FindClose = define('kernel32.dll', 'FindClose', 'bool(ptr)');
const INVALID_HANDLE = -1, DIRECTORY = 0x10, REPARSE_POINT = 0x400;
function codeOf(error) {
  switch (error) {
    case 2: case 3: case 15: case 53: case 67: case 123: case 161: case 206: return 'ENOENT';
    case 5: case 19: return 'EPERM';
    case 32: case 33: return 'EBUSY';
    case 80: case 183: return 'EEXIST';
    case 145: return 'ENOTEMPTY';
    case 267: return 'ENOTDIR';
    case 17: return 'EXDEV';
    case 87: return 'EINVAL';
    case 6: return 'EBADF';
    default: return 'UNKNOWN';
  }
}
function error(syscall, path, dest) {
  let code = codeOf(lastError());
  // Reading a directory as a file fails with EISDIR from read() in Node.js.
  if (code === 'EPERM' && syscall === 'open' && isDirectory(path)) { code = 'EISDIR'; syscall = 'read'; }
  fail(code, syscall, path, dest);
}
const attributeData = new Uint8Array(36), attributeView = new DataView(attributeData.buffer);
function attributes(path) {
  if (!GetFileAttributesExW(path, 0, attributeData)) return null;
  return attributeView.getUint32(0, true);
}
function isDirectory(path) { const a = attributes(path); return a !== null && (a & DIRECTORY) !== 0; }
const counter = new Uint32Array(1);
const sys = {
  separator: '\\',
  readAll(path) {
    const handle = CreateFileW(path, 0x80000000, 7, null, 3, 0x80, null);
    if (handle === INVALID_HANDLE) error('open', path);
    try {
      const size = new Uint8Array(8), view = new DataView(size.buffer);
      if (!GetFileSizeEx(handle, size)) error('read', path);
      const expected = view.getUint32(0, true) + view.getUint32(4, true) * 4294967296;
      return readChunks(expected, part => {
        if (!ReadFile(handle, part, Math.min(part.length, 0x40000000), counter, null)) error('read', path);
        return counter[0];
      });
    } finally { CloseHandle(handle); }
  },
  writeAll(path, bytes, append,exclusive=false,mode=0o666) {
    const handle = CreateFileW(path,append?0x4:0x40000000,7,null,exclusive?1:append?4:2,0x80,null);
    if (handle === INVALID_HANDLE) error('open', path);
    try {
      let offset = 0;
      while (offset < bytes.length) {
        const part = bytes.subarray(offset, offset + Math.min(bytes.length - offset, 0x40000000));
        if (!WriteFile(handle, part, part.length, counter, null)) error('write', path);
        offset += counter[0];
      }
    } finally { CloseHandle(handle); }
  },
  stat(path) {
    const a = attributes(path);
    if (a === null) {
      const code = codeOf(lastError());
      if (code === 'ENOENT' || code === 'ENOTDIR') return null;
      fail(code, 'stat', path);
    }
    const size = attributeView.getUint32(32, true) + attributeView.getUint32(28, true) * 4294967296;
    const ticks = attributeView.getUint32(20, true) + attributeView.getUint32(24, true) * 4294967296;
    const directory = (a & DIRECTORY) !== 0;
    const handle=CreateFileW(path,0,7,null,3,0x02000000,null);
    if(handle===INVALID_HANDLE)error('stat',path);
    const identity=new Uint8Array(52),identityView=new DataView(identity.buffer);
    try{if(!GetFileInformationByHandle(handle,identity))error('stat',path);}finally{CloseHandle(handle);}
    return { kind: directory ? 'dir' : 'file', size: directory ? 0 : size,
      dev:BigInt(identityView.getUint32(28,true)),ino:(BigInt(identityView.getUint32(44,true))<<32n)|BigInt(identityView.getUint32(48,true)),
      mtimeMs: (ticks - 116444736000000000) / 10000, mode: directory ? 0o40666 : 0o100666 };
  },
  lstat(path){const result=this.stat(path);if(result&&(attributes(path)&REPARSE_POINT))result.kind='link';return result;},
  realpath(path){
    const handle=CreateFileW(path,0,7,null,3,0x02000000,null);
    if(handle===INVALID_HANDLE)error('realpath',path);
    try{
      let data=new Uint16Array(1024),length=GetFinalPathNameByHandleW(handle,data,data.length,0);
      if(!length)error('realpath',path);
      if(length>=data.length){data=new Uint16Array(length+1);length=GetFinalPathNameByHandleW(handle,data,data.length,0);if(!length||length>=data.length)error('realpath',path);}
      let value='';for(let i=0;i<length;i++)value+=String.fromCharCode(data[i]);
      return value.startsWith('\\\\?\\UNC\\')?'\\\\'+value.slice(8):value.startsWith('\\\\?\\')?value.slice(4):value;
    }finally{CloseHandle(handle);}
  },
  readdir(path) {
    const data = new Uint8Array(592), view = new DataView(data.buffer);
    const pattern = path.endsWith('\\') || path.endsWith('/') ? path + '*' : path + '\\*';
    const handle = FindFirstFileW(pattern, data);
    if (handle === INVALID_HANDLE) {
      const code = codeOf(lastError());
      if (code === 'ENOENT' && attributes(path) !== null) fail('ENOTDIR', 'scandir', path);
      fail(code, 'scandir', path);
    }
    const names = [];
    try {
      do {
        let name = '';
        for (let i = 44; i < 564; i += 2) { const c = view.getUint16(i, true); if (c === 0) break; name += String.fromCharCode(c); }
        if (name !== '.' && name !== '..') names.push(name);
      } while (FindNextFileW(handle, data));
    } finally { FindClose(handle); }
    return names;
  },
  mkdir(path) { if (!CreateDirectoryW(path, null)) error('mkdir', path); },
  rmdir(path) { if (!RemoveDirectoryW(path)) error('rmdir', path); },
  unlink(path) {
    if (!DeleteFileW(path)) {
      if (isDirectory(path)) fail('EPERM', 'unlink', path);
      error('unlink', path);
    }
  },
  rename(from, to) { if (!MoveFileExW(from, to, 3)) error('rename', from, to); },
  copy(from, to) { if (!CopyFileW(from, to, false)) error('copyfile', from, to); }
};
`;

const linux=String.raw`
import { define } from 'nona:ffi';
const sysRead = define('syscall', '0', 'i64(i64,buf,i64)');
const sysWrite = define('syscall', '1', 'i64(i64,buf,i64)');
const sysOpen = define('syscall', '2', 'i64(buf,i64,i64)');
const sysClose = define('syscall', '3', 'i64(i64)');
const sysStat = define('syscall', '4', 'i64(buf,buf)');
const sysLstat = define('syscall', '6', 'i64(buf,buf)');
const sysReadlink = define('syscall','89','i64(buf,buf,i64)');
const sysFstat = define('syscall', '5', 'i64(i64,buf)');
const sysRename = define('syscall', '82', 'i64(buf,buf)');
const sysMkdir = define('syscall', '83', 'i64(buf,i64)');
const sysRmdir = define('syscall', '84', 'i64(buf)');
const sysUnlink = define('syscall', '87', 'i64(buf)');
const sysGetdents = define('syscall', '217', 'i64(i64,buf,i64)');
const O_WRONLY = 1, O_CREAT = 0x40, O_TRUNC = 0x200, O_APPEND = 0x400, O_DIRECTORY = 0x10000, O_CLOEXEC = 0x80000;
const codes = { 1: 'EPERM', 2: 'ENOENT', 5: 'EIO', 9: 'EBADF', 13: 'EACCES', 16: 'EBUSY', 17: 'EEXIST', 18: 'EXDEV', 20: 'ENOTDIR', 21: 'EISDIR', 22: 'EINVAL', 39: 'ENOTEMPTY' };
function check(result, syscall, path, dest) {
  if (result < 0) fail(codes[-result] || 'UNKNOWN', syscall, path, dest);
  return result;
}
function cpath(path) {
  const bytes = encoder.encode(path), out = new Uint8Array(bytes.length + 1);
  out.set(bytes);
  return out;
}
const statBuffer = new Uint8Array(144), statView = new DataView(statBuffer.buffer);
function statResult() {
  const mode = statView.getUint32(24, true), type = mode & 0o170000;
  const size = statView.getUint32(48, true) + statView.getUint32(52, true) * 4294967296;
  const seconds = statView.getUint32(88, true) + statView.getInt32(92, true) * 4294967296;
  const nanos = statView.getUint32(96, true);
  return { kind: type === 0o040000 ? 'dir' : type === 0o100000 ? 'file' : type === 0o120000 ? 'link' : 'other', size, mtimeMs: seconds * 1000 + nanos / 1e6, mode,
    dev:statView.getBigUint64(0,true),ino:statView.getBigUint64(8,true) };
}
function readAllFd(fd, path) {
  check(sysFstat(fd, statBuffer), 'read', path);
  return readChunks(statResult().size, part => check(sysRead(fd, part, part.length), 'read', path));
}
function writeAllFd(fd, bytes, path) {
  let offset = 0;
  while (offset < bytes.length) offset += check(sysWrite(fd, bytes.subarray(offset), bytes.length - offset), 'write', path);
}
const sys = {
  separator: '/',
  readAll(path) {
    const fd = check(sysOpen(cpath(path), O_CLOEXEC, 0), 'open', path);
    try { return readAllFd(fd, path); } finally { sysClose(fd); }
  },
  writeAll(path, bytes, append,exclusive=false,mode=0o666) {
    const fd = check(sysOpen(cpath(path), O_WRONLY | O_CREAT | O_CLOEXEC | (exclusive?0x80:0) | (append ? O_APPEND : O_TRUNC), mode), 'open', path);
    try { writeAllFd(fd, bytes, path); } finally { sysClose(fd); }
  },
  stat(path) {
    const result = sysStat(cpath(path), statBuffer);
    if (result === -2 || result === -20) return null;
    check(result, 'stat', path);
    return statResult();
  },
  lstat(path){const result=sysLstat(cpath(path),statBuffer);check(result,'lstat',path);return statResult();},
  realpath(path){
    let parts=path.split('/').filter(Boolean),resolved='/',links=0;
    while(parts.length){
      const part=parts.shift();if(part==='.')continue;if(part==='..'){resolved=dirname(resolved);continue;}
      const candidate=join(resolved,part),data=new Uint8Array(65536),length=sysReadlink(cpath(candidate),data,data.length);
      if(length===-22){if(this.stat(candidate)===null)fail('ENOENT','realpath',path);resolved=candidate;continue;}
      check(length,'realpath',path);if(length===data.length)fail('EINVAL','realpath',path);
      if(++links>40)fail('ELOOP','realpath',path);
      const destination=decoder.decode(data.subarray(0,length));
      if(destination.startsWith('/'))resolved='/';
      parts=destination.split('/').filter(Boolean).concat(parts);
    }
    if(this.stat(resolved)===null)fail('ENOENT','realpath',path);
    return resolved;
  },
  readdir(path) {
    const fd = check(sysOpen(cpath(path), O_DIRECTORY | O_CLOEXEC, 0), 'scandir', path);
    const buffer = new Uint8Array(32768), view = new DataView(buffer.buffer), names = [];
    try {
      for (;;) {
        const n = check(sysGetdents(fd, buffer, buffer.length), 'scandir', path);
        if (n === 0) break;
        for (let offset = 0; offset < n;) {
          const length = view.getUint16(offset + 16, true);
          let end = offset + 19; while (buffer[end] !== 0) end++;
          const name = decoder.decode(buffer.subarray(offset + 19, end));
          if (name !== '.' && name !== '..') names.push(name);
          offset += length;
        }
      }
    } finally { sysClose(fd); }
    return names;
  },
  mkdir(path) { check(sysMkdir(cpath(path), 0o777), 'mkdir', path); },
  rmdir(path) { check(sysRmdir(cpath(path)), 'rmdir', path); },
  unlink(path) { check(sysUnlink(cpath(path)), 'unlink', path); },
  rename(from, to) { check(sysRename(cpath(from), cpath(to)), 'rename', from, to); },
  copy(from, to) {
    const input = check(sysOpen(cpath(from), O_CLOEXEC, 0), 'copyfile', from, to);
    let bytes;
    try { bytes = readAllFd(input, from); } finally { sysClose(input); }
    const output = check(sysOpen(cpath(to), O_WRONLY | O_CREAT | O_TRUNC | O_CLOEXEC, 0o666), 'copyfile', from, to);
    try { writeAllFd(output, bytes, to); } finally { sysClose(output); }
  }
};
`;


/** AArch64's asm-generic table uses *at calls and a distinct stat layout. */
function linuxArm64Source():string {
 const replacements:Record<string,string>={
  "const sysRead = define('syscall', '0'":"const sysRead = define('syscall', '63'",
  "const sysWrite = define('syscall', '1'":"const sysWrite = define('syscall', '64'",
  "const sysClose = define('syscall', '3'":"const sysClose = define('syscall', '57'",
  "const sysFstat = define('syscall', '5'":"const sysFstat = define('syscall', '80'",
  "const sysGetdents = define('syscall', '217'":"const sysGetdents = define('syscall', '61'",
  "const sysOpen = define('syscall', '2', 'i64(buf,i64,i64)');":"const openat = define('syscall', '56', 'i64(i64,buf,i64,i64)');function sysOpen(path,flags,mode){return openat(-100,path,flags,mode)}",
  "const sysStat = define('syscall', '4', 'i64(buf,buf)');":"const statat = define('syscall', '79', 'i64(i64,buf,buf,i64)');function sysStat(path,buffer){return statat(-100,path,buffer,0)}",
  "const sysLstat = define('syscall', '6', 'i64(buf,buf)');":"function sysLstat(path,buffer){return statat(-100,path,buffer,256)}",
  "const sysReadlink = define('syscall','89','i64(buf,buf,i64)');":"const readlinkat=define('syscall','78','i64(i64,buf,buf,i64)');function sysReadlink(path,buffer,size){return readlinkat(-100,path,buffer,size)}",
  "const sysRename = define('syscall', '82', 'i64(buf,buf)');":"const renameat = define('syscall', '276', 'i64(i64,buf,i64,buf,i64)');function sysRename(from,to){return renameat(-100,from,-100,to,0)}",
  "const sysMkdir = define('syscall', '83', 'i64(buf,i64)');":"const mkdirat = define('syscall', '34', 'i64(i64,buf,i64)');function sysMkdir(path,mode){return mkdirat(-100,path,mode)}",
  "const sysRmdir = define('syscall', '84', 'i64(buf)');":"const unlinkat = define('syscall', '35', 'i64(i64,buf,i64)');function sysRmdir(path){return unlinkat(-100,path,512)}",
  "const sysUnlink = define('syscall', '87', 'i64(buf)');":"function sysUnlink(path){return unlinkat(-100,path,0)}",
  'getUint32(24, true)':'getUint32(16, true)',
  'O_DIRECTORY = 0x10000':'O_DIRECTORY = 0x4000',
 };
 let source=linux;for(const [from,to] of Object.entries(replacements))source=source.replace(from,to);return source;
}

/** Native 64-bit BSD/Darwin ABIs; filesystem algorithms remain our own. */
function bsdSource(target:Target):string {
 const darwin=target.startsWith('darwin-'),freebsd=target==='freebsd-x64';
 const calls:Record<string,string>={sysRead:'3',sysWrite:'4',sysOpen:'5',sysClose:'6',sysFstat:darwin?'339':freebsd?'551':'62',sysRename:'128',sysMkdir:'136',sysRmdir:'137',sysUnlink:'10',sysReadlink:'58'};
 let source=linux;
 for(const [name,number] of Object.entries(calls))source=source.replace(new RegExp("const "+name+" =? ?define\\('syscall', ?'\\d+'"),"const "+name+" = define('syscall', '"+number+"'");
 if(freebsd){
  source=source.replace("const sysStat = define('syscall', '4', 'i64(buf,buf)');","const statat=define('syscall','552','i64(i64,buf,buf,i64)');function sysStat(path,buffer){return statat(-100,path,buffer,0)}");
  source=source.replace("const sysLstat = define('syscall', '6', 'i64(buf,buf)');","function sysLstat(path,buffer){return statat(-100,path,buffer,512)}");
 }else{
  source=source.replace("const sysStat = define('syscall', '4'","const sysStat = define('syscall', '"+(darwin?'338':'38')+"'");
  source=source.replace("const sysLstat = define('syscall', '6'","const sysLstat = define('syscall', '"+(darwin?'340':'40')+"'");
 }
 source=source.replace("const sysGetdents = define('syscall', '217', 'i64(i64,buf,i64)');",darwin||freebsd?
  "const getdirentries=define('syscall','"+(darwin?'344':'554')+"','i64(i64,buf,i64,buf)');const directoryPosition=new Uint8Array(8);function sysGetdents(fd,buffer,size){return getdirentries(fd,buffer,size,directoryPosition)}":
  "const sysGetdents=define('syscall','99','i64(i64,buf,i64)');");
 source=source.replace('O_CREAT = 0x40, O_TRUNC = 0x200, O_APPEND = 0x400, O_DIRECTORY = 0x10000, O_CLOEXEC = 0x80000',
  'O_CREAT = 0x200, O_TRUNC = 0x400, O_APPEND = 8, O_DIRECTORY = '+(darwin?'0x100000':'0x20000')+', O_CLOEXEC = '+(darwin?'0x1000000':freebsd?'0x100000':'0x10000'));
 source=source.replace('exclusive?0x80:0','exclusive?0x800:0').replace("39: 'ENOTEMPTY'","66: 'ENOTEMPTY'");
 source=source.replace('const statBuffer = new Uint8Array(144)','const statBuffer = new Uint8Array(256)');
 const modeOffset=darwin?4:freebsd?24:0,sizeOffset=darwin?96:freebsd?112:80,timeOffset=freebsd?64:48;
 const modeRead=darwin||freebsd?'getUint16':'getUint32';
 source=source.replace(/function statResult\(\) \{[\s\S]*?\n\}/,`function statResult(){
  const mode=statView.${modeRead}(${modeOffset},true),type=mode&0o170000;
  return {kind:type===0o040000?'dir':type===0o100000?'file':type===0o120000?'link':'other',
   size:Number(statView.getBigInt64(${sizeOffset},true)),mtimeMs:Number(statView.getBigInt64(${timeOffset},true))*1000+Number(statView.getBigInt64(${timeOffset+8},true))/1e6,mode,
   dev:${freebsd?'statView.getBigUint64(0,true)':'BigInt(statView.getUint32('+(darwin?0:4)+',true))'},ino:statView.getBigUint64(8,true)};
 }`);
 // d_name starts after the ABI-specific directory entry header, not Linux's.
 const nameOffset=darwin?21:24;
 source=source.replaceAll('offset + 19','offset + '+nameOffset);
 return source;
}

export function fsModuleSource(target:Target):string {
  if(target.startsWith('darwin-')||target==='freebsd-x64'||target==='openbsd-x64')return bsdSource(target)+common;
  if(target!=='win32-x64'&&target!=='win32-arm64'&&target!=='linux-x64'&&target!=='linux-arm64')throw new CompileError([{code:'E_HOST_MODULE',file:'node:fs',span:{start:0,end:0},message:`Filesystem adapter is not implemented for ${target}`}]);
  return (target==='linux-arm64'?linuxArm64Source():target==='linux-x64'?linux:win32)+common;
}
