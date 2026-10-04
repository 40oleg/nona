import type {NativeProgram} from '../pe/model.js';
import {linkElf} from '../elf/writer.js';
import {linuxShims} from './shims.js';
import {withNativeTarget} from '../machine/context.js';

export function linkLinux(program:NativeProgram):Uint8Array {
 return withNativeTarget('linux-x64',()=>linkElf({...program,imports:[],fragments:[...program.fragments,...linuxShims(program.imports)]}));
}
