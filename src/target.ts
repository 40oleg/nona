/** Native output identities. Distribution names do not change the Linux ABI. */
export type Target='win32-x64'|'linux-x64'|'darwin-x64'|'darwin-arm64'|'linux-arm64'|'win32-arm64'|'freebsd-x64'|'openbsd-x64';
export type NativeOS='win32'|'linux'|'darwin'|'freebsd'|'openbsd';
export type NativeArch='x64'|'arm64';
export interface TargetDescriptor {
  readonly target:Target;
  readonly os:NativeOS;
  readonly arch:NativeArch;
  readonly format:'pe'|'elf'|'macho';
  readonly fileMode:number;
}

const definitions:readonly [Target,NativeOS,NativeArch,TargetDescriptor['format']][]=[
  ['win32-x64','win32','x64','pe'],['linux-x64','linux','x64','elf'],
  ['darwin-x64','darwin','x64','macho'],['darwin-arm64','darwin','arm64','macho'],
  ['linux-arm64','linux','arm64','elf'],['win32-arm64','win32','arm64','pe'],
  ['freebsd-x64','freebsd','x64','elf'],['openbsd-x64','openbsd','x64','elf'],
];
export const nativeTargets:readonly TargetDescriptor[]=Object.freeze(definitions.map(([target,os,arch,format])=>Object.freeze({target,os,arch,format,fileMode:os==='win32'?0o666:0o755})));
const targets=new Map<string,TargetDescriptor>(nativeTargets.map(descriptor=>[descriptor.target,descriptor]));

export function getTarget(target:string):TargetDescriptor|undefined {return targets.get(target);}
/** Unsupported hosts require an explicit cross-compilation target. */
export function detectHostTarget(platform:string=process.platform,arch:string=process.arch):Target|undefined {
  return getTarget(`${platform}-${arch}`)?.target;
}
export function requireHostTarget():Target {
  const target=detectHostTarget();
  if(target===undefined)throw new Error(`Unsupported native host ${process.platform}/${process.arch}; supply an explicit target`);
  return target;
}

/** Compiler backends with complete native runtime linking. */
export const supportedNativeTargets:readonly Target[]=Object.freeze(nativeTargets.map(t=>t.target));
