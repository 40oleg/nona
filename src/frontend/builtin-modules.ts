import type {ModuleHost} from './modules.js';
import {ffiModuleSource} from '../ffi.js';
import {fsModuleSource} from './fs-module.js';
import {eventsModuleForTarget} from './events-module.js';

/** Curated Win32 declarations on top of `nona:ffi`. */
const win32ModuleSource=`import {define, lastError} from 'nona:ffi';
export {lastError};
export const HKEY_CLASSES_ROOT = -2147483648;
export const HKEY_CURRENT_USER = -2147483647;
export const HKEY_LOCAL_MACHINE = -2147483646;
export const KEY_READ = 0x20019;
export const KEY_WRITE = 0x20006;
export const KEY_ALL_ACCESS = 0xF003F;
export const REG_SZ = 1;
export const REG_DWORD = 4;
export const ERROR_SUCCESS = 0;
export const ERROR_FILE_NOT_FOUND = 2;
export const ERROR_ALREADY_EXISTS = 183;
export const SPI_GETDESKWALLPAPER = 0x0073;
export const SPI_SETDESKWALLPAPER = 0x0014;
export const SPIF_UPDATEINIFILE = 0x01;
export const SPIF_SENDCHANGE = 0x02;
export const MB_OK = 0;
export const MB_ICONERROR = 0x10;
export const MB_ICONINFORMATION = 0x40;
export const MAX_PATH = 260;
// user32
export const MessageBoxW = define('user32.dll', 'MessageBoxW', 'i32(ptr,wstr,wstr,u32)');
export const GetSystemMetrics = define('user32.dll', 'GetSystemMetrics', 'i32(i32)');
/** SystemParametersInfoW with a string pvParam (for example SPI_SETDESKWALLPAPER). */
export const SystemParametersInfoW = define('user32.dll', 'SystemParametersInfoW', 'bool(u32,u32,wstr,u32)');
/** SystemParametersInfoW with a buffer pvParam (for example SPI_GETDESKWALLPAPER into a Uint16Array). */
export const SystemParametersInfoBufferW = define('user32.dll', 'SystemParametersInfoW', 'bool(u32,u32,buf,u32)');
// kernel32
export const CreateMutexW = define('kernel32.dll', 'CreateMutexW', 'ptr(ptr,bool,wstr)');
export const ReleaseMutex = define('kernel32.dll', 'ReleaseMutex', 'bool(ptr)');
export const CloseHandle = define('kernel32.dll', 'CloseHandle', 'bool(ptr)');
export const GetModuleFileNameW = define('kernel32.dll', 'GetModuleFileNameW', 'u32(ptr,buf,u32)');
export const GetCurrentProcessId = define('kernel32.dll', 'GetCurrentProcessId', 'u32()');
// advapi32
export const RegCreateKeyExW = define('advapi32.dll', 'RegCreateKeyExW', 'i32(ptr,wstr,u32,ptr,u32,u32,ptr,buf,buf)');
export const RegOpenKeyExW = define('advapi32.dll', 'RegOpenKeyExW', 'i32(ptr,wstr,u32,u32,buf)');
export const RegSetValueExW = define('advapi32.dll', 'RegSetValueExW', 'i32(ptr,wstr,u32,u32,buf,u32)');
export const RegQueryValueExW = define('advapi32.dll', 'RegQueryValueExW', 'i32(ptr,wstr,ptr,buf,buf,buf)');
export const RegDeleteValueW = define('advapi32.dll', 'RegDeleteValueW', 'i32(ptr,wstr)');
export const RegDeleteKeyW = define('advapi32.dll', 'RegDeleteKeyW', 'i32(ptr,wstr)');
export const RegCloseKey = define('advapi32.dll', 'RegCloseKey', 'i32(ptr)');

/** A UTF-16 string as a NUL-terminated Uint16Array (for buf parameters). */
export function wideString(text) {
  text = String(text);
  const buffer = new Uint16Array(text.length + 1);
  for (let i = 0; i < text.length; i++) buffer[i] = text.charCodeAt(i);
  return buffer;
}
/** Decode a NUL-terminated UTF-16 buffer. */
export function fromWideString(buffer) {
  let text = '';
  for (let i = 0; i < buffer.length && buffer[i] !== 0; i++) text += String.fromCharCode(buffer[i]);
  return text;
}
/** Read a HKEY (or other handle) written by the callee into an 8-byte buffer. */
export function readHandle(buffer) {
  const view = new DataView(buffer.buffer || buffer, buffer.byteOffset || 0, 8);
  return view.getUint32(0, true) + view.getInt32(4, true) * 4294967296;
}
`;

/** node:process / nona:process re-export the global process object. */
const processModuleSource=`const process = globalThis.process;
export default process;
export const argv = process.argv, env = process.env, platform = process.platform, arch = process.arch, pid = process.pid, execPath = process.execPath;
export function exit(code) { return process.exit(code); }
export function cwd() { return process.cwd(); }
`;

import type {Target} from '../target.js';
const sources=new Map<string,(target:Target)=>string>([
  ['nona:ffi',()=>ffiModuleSource],
  ['nona:win32',()=>win32ModuleSource],
  ['nona:fs',fsModuleSource],
  ['node:fs',fsModuleSource],
  ['node:events',eventsModuleForTarget],
  ['events',eventsModuleForTarget],
  ['nona:events',eventsModuleForTarget],
  ['nona:process',()=>processModuleSource],
  ['node:process',()=>processModuleSource],
]);

export function isBuiltinModule(specifier:string):boolean {return sources.has(specifier);}

/** Wrap a module host so that `nona:*` (and supported `node:*`) specifiers resolve to built-in modules. */
export function withBuiltinModules(host:ModuleHost,target:Target):ModuleHost {
  return {
    resolve:(specifier,referrer)=>specifier==='events'||specifier==='nona:events'?'node:events':sources.has(specifier)?specifier:host.resolve(specifier,referrer),
    read:path=>sources.get(path)?.(target)??host.read(path),
    ...(host.candidates?{candidates:(referrer:string)=>host.candidates!(referrer)}:{}),
  };
}
