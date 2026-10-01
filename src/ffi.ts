/** Native foreign function declarations (`define` from `nona:ffi`). */
export const ffiIntegerTypes=['i8','i16','i32','i64','u8','u16','u32','u64','ptr','bool'] as const;
export const ffiFloatTypes=['f32','f64'] as const;
export const ffiPointerTypes=['wstr','str','buf'] as const;
export type FfiType=typeof ffiIntegerTypes[number]|typeof ffiFloatTypes[number]|typeof ffiPointerTypes[number]|'void';
export interface FfiSignature {result:FfiType;parameters:FfiType[]}
export interface FfiDeclaration {dll:string;name:string;signature:string}

const parameterTypes=new Set<string>([...ffiIntegerTypes,...ffiFloatTypes,...ffiPointerTypes]);
const resultTypes=new Set<string>([...ffiIntegerTypes,...ffiFloatTypes,'void']);
/** Reserved for later versions (callbacks, out parameters). */
const reserved=/^(cb|out)\b/;

/** Parse `result(param,param,...)`; throws an Error with a user-facing message. */
export function parseFfiSignature(text:string):FfiSignature {
  const match=/^\s*([a-z0-9]+)\s*\(\s*([^()]*?)\s*\)\s*$/.exec(text);
  if(!match)throw new Error(`Invalid FFI signature '${text}': expected 'result(type,...)'`);
  const result=match[1]!,list=match[2]!;
  if(!resultTypes.has(result))throw new Error(`Unsupported FFI result type '${result}'`);
  const parameters=list===''?[]:list.split(',').map(part=>part.trim());
  for(const parameter of parameters){
    if(reserved.test(parameter))throw new Error(`FFI type '${parameter}' is reserved and not supported yet`);
    if(!parameterTypes.has(parameter))throw new Error(`Unsupported FFI parameter type '${parameter}'`);
  }
  if(parameters.length>32)throw new Error('FFI functions support at most 32 parameters');
  return {result:result as FfiType,parameters:parameters as FfiType[]};
}

/** Validate a DLL name and export name for the PE import table. */
export function checkFfiNames(dll:string,name:string):void {
  if(dll==='syscall'){if(!/^\d{1,3}$/.test(name))throw new Error(`Invalid system call number '${name}'`);return;}
  if(!/^[\x21-\x7e]+$/.test(dll)||/[\\/]/.test(dll))throw new Error(`Invalid DLL name '${dll}'`);
  if(!/^[A-Za-z_?@$][\x21-\x7e]*$/.test(name))throw new Error(`Invalid export name '${name}'`);
}

export function ffiImportSymbol(d:FfiDeclaration):string {return 'ffi.'+d.dll.toLowerCase()+'!'+d.name;}

/** Source of the built-in `nona:ffi` module. `define` calls are compiled statically. */
export const ffiModuleSource=`export function define(dll, name, signature) {
  throw new TypeError('nona:ffi define() must be called directly with three string literals');
}
export function lastError() {
  return typeof __nonaFfiLastError === 'function' ? __nonaFfiLastError() : 0;
}
`;
