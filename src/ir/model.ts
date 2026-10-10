export type Constant = undefined|null|boolean|number|bigint|string;
export type Operation =
  /** The closure of realm-local function `target` (compiled per realm) in the realm of `ctor`, when `ctor` is that realm's %Function%; otherwise undefined. */
  | {kind:'realmFunction';dest:number;ctor:number;target:string}
  | {kind:'newFunction';strict?:boolean;dest:number;target:string;method?:boolean;classConstructor?:boolean;arrow?:boolean;generator?:boolean;async?:boolean;homeObject?:number;captures?:number[];name?:string;nameSlot?:number;parameterCount?:number;sourceText?:string;/** The function's text as a range of its module's source (instead of sourceText). */sourceRange?:{source:string;start:number;end:number}}
  | {kind:'defineDataProperty';object:number;key:number;source:number;attributes:number}
  /** CreateDataPropertyOrThrow (class fields): key is a property key. */
  | {kind:'defineField';object:number;key:number;source:number}
  /** A private field or method of object (name: the private name, a WeakMap); TypeError without it. */
  | {kind:'privateGet';dest:number;object:number;name:number}
  /** Writes a private field of object; TypeError without it. */
  | {kind:'privateSet';object:number;name:number;source:number}
  | {kind:'newCell';dest:number;source:number}
  | {kind:'readCell';dest:number;cell:number}
  | {kind:'writeCell';cell:number;source:number}
  | {kind:'loadCapture';dest:number;index:number}
  | {kind:'currentFunction';dest:number}
  | {kind:'superConstructor';dest:number;/** Constructor whose [[Prototype]] is used; default: the running function. */func?:number}
  | {kind:'superReceiver';dest:number}
  | {kind:'setFunctionHomeObject';func:number;homeObject:number}
  | {kind:'setCurrentThis';source:number}
  | {kind:'validateClassHeritage';base:number}
  | {kind:'validateClassPrototype';prototype:number}
  | {kind:'pushHandler';index:number;target:number;error:number;handlerKind?:'catch'|'finally'}
  | {kind:'popHandler'}
  | {kind:'newTarget';dest:number}
  | {kind:'superBase';dest:number}
  | {kind:'superGet';dest:number;object:number;key:number;receiver:number;/** `super.name`: the literal name */keyName?:string}
  | {kind:'superSet';strict?:boolean;object:number;key:number;receiver:number;source:number}
  | {kind:'currentThis';dest:number}
  | {kind:'globalObject';dest:number}
  | {kind:'readGlobalProperty';dest:number;name:string;allowMissing:boolean}
  | {kind:'invoke';dest:number;callee:number;arguments:number[];receiver?:number;construct?:boolean;newTarget?:number;tail?:boolean;/** Code label of the function the callee is expected to be (src/ir/calls.ts). */direct?:string;/** That function is strict (receives this unchanged). */directStrict?:boolean;/** `object.hasOwnProperty(key)` ('method') or `f.call(object, key)` ('call'): when the callee is %Object.prototype.hasOwnProperty% (or `call` of it), a shaped object may be answered by a per-site cache (has-cache.ts). */hasOwn?:'method'|'call'}
  | {kind:'invokeArray';dest:number;callee:number;array:number;receiver?:number;construct?:boolean;newTarget?:number}
  /** Constructs callee with the current function's own arguments (a default derived constructor's super(...args)). */
  | {kind:'constructForward';dest:number;callee:number;receiver:number;newTarget:number}
  | {kind:'yield';dest:number;source:number}
  | {kind:'await';dest:number;source:number}
  | {kind:'yieldDelegated';dest:number;mode:number;source:number;value?:boolean}
  | {kind:'generatorInitialSuspend'}
  | {kind:'requireObject';source:number}
  | {kind:'newInstance';dest:number;callee:number;firstArgument?:number;argumentArray?:number}
  | {kind:'constructorResult';dest:number;result:number;instance:number}
  | {kind:'derivedReturn';dest:number;source:number}
  | {kind:'newArguments';dest:number;parameters:number[];/** Non-simple parameter list: unmapped, callee is %ThrowTypeError%. */unmapped?:boolean} // -1: earlier duplicate, no mapping
  | {kind:'newRestArray';dest:number;start:number}
  | {kind:'newObject';dest:number;array:boolean;length:number;slots?:number;/** An object literal whose keys are all known (#194): its distinct keys in order. The final shape is resolved once per site. */keys?:string[]}
  | {kind:'forInKeys';dest:number;object:number}
  | {kind:'forInHas';dest:number;object:number;key:number}
  | {kind:'getIterator';iterator:number;next:number;object:number}
  | {kind:'iteratorStep';dest:number;done:number;iterator:number;next:number}
  | {kind:'iteratorClose';iterator:number}
  | {kind:'requireIterable';object:number}
  | {kind:'forOfValue';dest:number;iterable:number;index:number}
  | {kind:'property';strict?:boolean;operation:'get'|'delete'|'has';dest:number;object:number;key:number;/** The key is this literal name (`object.name`): the read may use an inline cache. */keyName?:string}
  | {kind:'setProperty';strict?:boolean;object:number;key:number;source:number;define:boolean;/** `object.name = value`: the write may use an inline cache. */keyName?:string;/** The initial definition of key `keys[literalSlot]` of the object literal `object` (a newObject with keys). */literalSlot?:number}
  | {kind:'defineAccessor';object:number;key:number;source:number;setter:boolean;nonEnumerable?:boolean}
  | {kind:'setPrototype';object:number;prototype:number}
  | {kind:'uninitialized';dest:number}
  | {kind:'checkInitialized';slot:number}
  | {kind:'checkResolvable';slot:number}
  | {kind:'immutableWrite';error?:'ReferenceError'}
  | {kind:'constant';dest:number;value:Constant}
  | {kind:'copy';dest:number;source:number}
  | {kind:'loadGlobal';dest:number;index:number;prelude?:boolean}
  | {kind:'storeGlobal';strict?:boolean;source:number;index:number;prelude?:boolean}
  | {kind:'unary';dest:number;operator:string;argument:number;/** The argument is a Number (src/ir/numbers.ts). */numeric?:boolean}
  | {kind:'binary';dest:number;operator:string;left:number;right:number;/** Both operands are Numbers (src/ir/numbers.ts). */numeric?:boolean}
  | {kind:'call';dest:number;target:string;arguments:number[]};
export type Terminator = {kind:'throw';value:number}| {kind:'jump';target:number}|{kind:'branch';condition:number;yes:number;no:number}|{kind:'return';value:number};
export interface BlockIR {id:number;exceptionTarget?:number;operations:Operation[];terminator:Terminator}
export interface FunctionIR {id:string;name:string;/** Where the function is in its script (coverage): script index into ModuleIR.scripts, V8 function name, UTF-16 offsets. */source?:{script:number;name:string;start:number;end:number};parameterCount:number;localCount:number;slotCount:number;maxArguments:number;handlerCount?:number;derivedConstructor?:boolean;generator?:boolean;blocks:BlockIR[]}
export interface FfiDeclarationIR {dll:string;name:string;signature:string;span:{start:number;end:number}}
export interface ModuleIR {/** Script paths by index: 0 is the program (named by the compiler), i+1 module record i. */scripts?:string[];/** Native foreign functions declared with nona:ffi define(); index = declaration id. */ffi?:FfiDeclarationIR[];globalCount:number;functions:FunctionIR[];globalProperties?:{name:string;index:number}[];runtimePrelude?:boolean}
