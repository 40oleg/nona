import {createAssembler,currentNativeTarget} from '../backend/machine/context.js';
import type { NamedFragment, ImportSymbol, UnwindFunction } from '../backend/pe/model.js';
import { Assembler } from '../backend/x64/assembler.js';
export interface RuntimeRequest {operations:ReadonlySet<string>;realms?:number;/** Link the normalization tables (default true). */unicodeNormalization?:boolean}
export interface RuntimeBundle {fragments:NamedFragment[];imports:ImportSymbol[];functions:UnwindFunction[]}
export class RuntimeBuilder {
 bundle:RuntimeBundle={fragments:[],imports:[],functions:[]};
 fn(name:string,size:number,body:(a:Assembler)=>void):void {const a=createAssembler(name);a.sub('rsp',size);const p=a.offset;body(a);a.add('rsp',size);a.ret();a.label(name+'.end');this.bundle.fragments.push({...a.finish(),name,section:'.text'});this.bundle.functions.push({begin:name,end:name+'.end',prologSize:p,stackAllocation:size,savedRegisters:[]});}
 data(name:string,bytes:Uint8Array,section:'.rdata'|'.data'='.rdata'):void {this.bundle.fragments.push({name,section,alignment:8,bytes,fixups:[],symbols:{}});}
}
export const slot=(disp:number)=>({base:'rsp' as const,disp});
/** Conditional failure keeps the caller's aligned frame and unwind chain. */
export function failIf(a:Assembler,c:import('../backend/x64/assembler.js').Condition,target='rt.fail'):void {
 const inverse={e:'ne',ne:'e',l:'ge',le:'g',g:'le',ge:'l',b:'ae',be:'a',a:'be',ae:'b',p:'np',np:'p',s:'ns',ns:'s',o:'no',no:'o'} as const;
 const skip=a.unique('noError');a.jcc(inverse[c],skip);a.call(target);a.label(skip);
}
