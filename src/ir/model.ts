export type Constant = undefined|null|boolean|number|string;
export type Operation =
  | {kind:'newFunction';strict?:boolean;dest:number;target:string;method?:boolean;classConstructor?:boolean;arrow?:boolean;generator?:boolean;homeObject?:number;captures?:number[];name?:string;nameSlot?:number;parameterCount?:number;sourceText?:string}
  | {kind:'defineDataProperty';object:number;key:number;source:number;attributes:number}
  | {kind:'newCell';dest:number;source:number}
  | {kind:'readCell';dest:number;cell:number}
  | {kind:'writeCell';cell:number;source:number}
  | {kind:'loadCapture';dest:number;index:number}
  | {kind:'currentFunction';dest:number}
  | {kind:'superConstructor';dest:number}
  | {kind:'superReceiver';dest:number}
  | {kind:'setFunctionHomeObject';func:number;homeObject:number}
  | {kind:'setCurrentThis';source:number}
  | {kind:'validateClassHeritage';base:number}
  | {kind:'validateClassPrototype';prototype:number}
  | {kind:'pushHandler';index:number;target:number;error:number;handlerKind?:'catch'|'finally'}
  | {kind:'popHandler'}
  | {kind:'newTarget';dest:number}
  | {kind:'superBase';dest:number}
  | {kind:'superGet';dest:number;object:number;key:number;receiver:number}
  | {kind:'superSet';strict?:boolean;object:number;key:number;receiver:number;source:number}
  | {kind:'currentThis';dest:number}
  | {kind:'globalObject';dest:number}
  | {kind:'readGlobalProperty';dest:number;name:string;allowMissing:boolean}
  | {kind:'invoke';dest:number;callee:number;arguments:number[];receiver?:number;construct?:boolean;newTarget?:number}
  | {kind:'invokeArray';dest:number;callee:number;array:number;receiver?:number;construct?:boolean;newTarget?:number}
  | {kind:'yield';dest:number;source:number}
  | {kind:'yieldDelegated';dest:number;mode:number;source:number}
  | {kind:'generatorInitialSuspend'}
  | {kind:'requireObject';source:number}
  | {kind:'newInstance';dest:number;callee:number}
  | {kind:'constructorResult';dest:number;result:number;instance:number}
  | {kind:'derivedReturn';dest:number;source:number}
  | {kind:'newArguments';dest:number;parameters:number[]} // -1: earlier duplicate, no mapping
  | {kind:'newRestArray';dest:number;start:number}
  | {kind:'newObject';dest:number;array:boolean;length:number}
  | {kind:'forInKeys';dest:number;object:number}
  | {kind:'forInHas';dest:number;object:number;key:number}
  | {kind:'getIterator';iterator:number;next:number;object:number}
  | {kind:'iteratorStep';dest:number;done:number;iterator:number;next:number}
  | {kind:'iteratorClose';iterator:number}
  | {kind:'requireIterable';object:number}
  | {kind:'forOfValue';dest:number;iterable:number;index:number}
  | {kind:'property';strict?:boolean;operation:'get'|'delete'|'has';dest:number;object:number;key:number}
  | {kind:'setProperty';strict?:boolean;object:number;key:number;source:number;define:boolean}
  | {kind:'defineAccessor';object:number;key:number;source:number;setter:boolean;nonEnumerable?:boolean}
  | {kind:'setPrototype';object:number;prototype:number}
  | {kind:'uninitialized';dest:number}
  | {kind:'checkInitialized';slot:number}
  | {kind:'checkResolvable';slot:number}
  | {kind:'immutableWrite';error?:'ReferenceError'}
  | {kind:'constant';dest:number;value:Constant}
  | {kind:'copy';dest:number;source:number}
  | {kind:'loadGlobal';dest:number;index:number}
  | {kind:'storeGlobal';strict?:boolean;source:number;index:number}
  | {kind:'unary';dest:number;operator:string;argument:number}
  | {kind:'binary';dest:number;operator:string;left:number;right:number}
  | {kind:'call';dest:number;target:string;arguments:number[]};
export type Terminator = {kind:'throw';value:number}| {kind:'jump';target:number}|{kind:'branch';condition:number;yes:number;no:number}|{kind:'return';value:number};
export interface BlockIR {id:number;exceptionTarget?:number;operations:Operation[];terminator:Terminator}
export interface FunctionIR {id:string;name:string;parameterCount:number;localCount:number;slotCount:number;maxArguments:number;handlerCount?:number;derivedConstructor?:boolean;generator?:boolean;blocks:BlockIR[]}
export interface ModuleIR {globalCount:number;functions:FunctionIR[];globalProperties?:{name:string;index:number}[];globalFunctionProperties?:string[]}
