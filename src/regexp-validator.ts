import {runInNewContext} from 'node:vm';
import {regexpVmSource} from './runtime/regexp-vm-source.js';

/**
 * RegExp literal validation for the lexer (installed by compiler.ts through
 * setRegExpValidator): the runtime's own pattern compiler, evaluated once in a
 * separate context, so the compiler accepts exactly the patterns the runtime
 * can compile. The self-hosting bootstrap replaces this module with one that
 * embeds the same source directly (no node:vm).
 */
let compilePattern:((pattern:string,flags:string)=>unknown)|undefined;
export function validateRegExp(pattern:string,flags:string):void {
  compilePattern??=(runInNewContext(regexpVmSource) as {compile:(pattern:string,flags:string)=>unknown}).compile;
  compilePattern(pattern,flags);
}
