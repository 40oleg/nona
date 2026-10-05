export type Arm64Relocation='arm64-page21'|'arm64-pageoff12'|'arm64-branch26';

/** Patch an A64 instruction using byte addresses, preserving its register/opcode. */
export function relocateArm64(kind:Arm64Relocation,instruction:number,place:number,target:number):number {
  if(!Number.isSafeInteger(place)||place<0||!Number.isSafeInteger(target)||target<0)
    throw new RangeError('ARM64 relocation address out of range');
  if(place%4)throw new Error('ARM64 instruction alignment is invalid');
  if(!Number.isInteger(instruction)||instruction<0||instruction>0xffffffff)
    throw new Error('Invalid ARM64 instruction word');
  if(kind==='arm64-page21'){
    if((instruction&0x9f000000)>>>0!==0x90000000)throw new Error('ARM64 page relocation requires an ADRP instruction');
    const delta=Math.floor(target/4096)-Math.floor(place/4096);
    if(delta<-(2**20)||delta>=2**20)throw new RangeError('ARM64 page relocation out of range');
    const immediate=delta&0x1fffff;
    return ((instruction&0x9f00001f)|((immediate&3)<<29)|((immediate>>>2)<<5))>>>0;
  }
  if(kind==='arm64-pageoff12'){
    if((instruction&0xffc00000)>>>0!==0x91000000)throw new Error('ARM64 page offset relocation requires an unshifted ADD instruction');
    return ((instruction&0xffc003ff)|((target%4096)<<10))>>>0;
  }
  if(kind==='arm64-branch26'){
    if((instruction&0x7c000000)!==0x14000000)throw new Error('ARM64 branch relocation requires a B or BL instruction');
    const delta=target-place;
    if(delta%4)throw new Error('ARM64 branch target alignment is invalid');
    if(delta<-(2**27)||delta>=2**27)throw new RangeError('ARM64 branch relocation out of range');
    return ((instruction&0xfc000000)|((delta/4)&0x3ffffff))>>>0;
  }
  throw new Error('Unknown ARM64 relocation');
}

export function isArm64Relocation(kind:string):kind is Arm64Relocation {
  return kind==='arm64-page21'||kind==='arm64-pageoff12'||kind==='arm64-branch26';
}
