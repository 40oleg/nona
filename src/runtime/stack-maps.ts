import type {NamedFragment} from '../backend/pe/model.js';

/**
 * Stack maps (#165): which value slots of a compiled function's frame the
 * collector scans at each safepoint.
 *
 * A JS frame's root record covers every value slot, and the generated code
 * used to store zeros into each slot that had died since the last safepoint
 * before every operation that could reach the runtime, so that a collection
 * would not keep a dead slot's old value alive (16 % of a large program's
 * code). Now every function has a static table: for the return address of
 * every call the function makes (including the block-entry `call
 * rt.collect`) a bitmap of the frame locations that are live there. The
 * collector finds the frame's current return address below its root record
 * (frame-layout.ts), looks the offset up and scans only the listed
 * locations, plus the this, new.target and super-receiver slots that follow
 * them. A location that is not listed is never read again before it is
 * written, so whatever it holds is irrelevant; a listed location always
 * holds a valid Value (an operation's destinations are listed, because the
 * runtime may keep its result there across a nested call, and a destination
 * that was dead before the operation is reset to undefined first).
 *
 * An entry covers every return address from its offset up to the next
 * entry's: consecutive calls under the same map share one entry. Every call
 * the code generator emits is recorded, so a return address before the first
 * entry is a bug (it fails under GC stress, and marks every slot otherwise).
 *
 * Table layout (.rdata, `<function>.maps`):
 *   0   the function's code address (the offsets are relative to it)
 *   8   u32 entry count
 *   12  u8 field width (2 or 4 bytes: offsets and map indices), u8 unused,
 *       u16 bitmap bytes (one bit per location, at least one byte)
 *   16  entries, sorted by offset: {offset, map index}, two fields each
 *   then the bitmaps, `bitmapBytes` each
 */
export const StackMapTable={code:0,count:8,fieldWidth:12,bitmapBytes:14,entries:16} as const;

export interface StackMapEntry {offset:number;map:number}
/**
 * Builds a function's table; `maps` are the distinct maps the entries index,
 * each the sorted locations it lists beyond the first `alwaysLive` locations,
 * which every map lists.
 */
export function stackMapFragment(name:string,code:string,entries:readonly StackMapEntry[],maps:readonly (readonly number[])[],locations:number,alwaysLive=0):NamedFragment {
 for(let i=1;i<entries.length;i++)if(entries[i]!.offset<=entries[i-1]!.offset)throw new Error('Stack map entries must be sorted by offset');
 const bitmapBytes=Math.max(1,Math.ceil(locations/8));
 if(bitmapBytes>0xffff)throw new RangeError('Stack map bitmap exceeds supported width');
 const wide=entries.some(entry=>entry.offset>0xffff||entry.map>0xffff),width=wide?4:2;
 const base=StackMapTable.entries+2*width*entries.length;
 const bytes=new Uint8Array(base+bitmapBytes*maps.length),view=new DataView(bytes.buffer);
 view.setUint32(StackMapTable.count,entries.length,true);bytes[StackMapTable.fieldWidth]=width;view.setUint16(StackMapTable.bitmapBytes,bitmapBytes,true);
 const field=(at:number,value:number)=>{if(width===2)view.setUint16(at,value,true);else view.setUint32(at,value,true);};
 entries.forEach((entry,i)=>{field(StackMapTable.entries+2*width*i,entry.offset);field(StackMapTable.entries+2*width*i+width,entry.map);});
 // The locations every map lists, as whole bytes and the bits of a last partial byte.
 const prefix=new Uint8Array(bitmapBytes);for(let l=0;l<alwaysLive;l++)prefix[l>>3]!|=1<<(l&7);
 maps.forEach((map,m)=>{
  const at=base+bitmapBytes*m;bytes.set(prefix,at);
  for(const l of map){if(l<0||l>=locations)throw new Error('Stack map location out of range');bytes[at+(l>>3)]!|=1<<(l&7);}
 });
 return {name,section:'.rdata',alignment:8,bytes,fixups:[{offset:StackMapTable.code,kind:'va64',target:code,addend:0}],symbols:{}};
}
