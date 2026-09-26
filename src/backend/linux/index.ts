import type {NativeProgram} from '../pe/model.js';
import {linkElf} from '../elf/writer.js';
import {linuxShims} from './shims.js';

export function linkLinux(program:NativeProgram):Uint8Array {
 return linkElf({...program,imports:[],fragments:[...program.fragments,...linuxShims(program.imports)]});
}
