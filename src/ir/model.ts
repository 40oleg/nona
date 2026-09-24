export type Constant = undefined|null|boolean|number|string;
export type Operation =
  | {kind:'newFunction';strict?:boolean;dest:number;target:string;method?:boolean;homeObject?:number;captures?:number[];name?:string;nameSlot?:number;parameterCount?:number;sourceText?:string}
  | {kind:'newCell';dest:number;source:number}
  | {kind:'readCell';dest:number;cell:number}
  | {kind:'writeCell';cell:number;source:number}
  | {kind:'loadCapture';dest:number;index:number}
  | {kind:'currentFunction';dest:number}
  | {kind:'pushHandler';index:number;target:number;error:number}
  | {kind:'popHandler'}
  | {kind:'newTarget';dest:number}
  | {kind:'superBase';dest:number}
  | {kind:'superGet';dest:number;object:number;key:number;receiver:number}
  | {kind:'superSet';strict?:boolean;object:number;key:number;receiver:number;source:number}
  | {kind:'currentThis';dest:number}
  | {kind:'globalObject';dest:number}
  | {kind:'readGlobalProperty';dest:number;name:string;allowMissing:boolean}
  | {kind:'invoke';dest:number;callee:number;arguments:number[];receiver?:number;construct?:boolean}
  | {kind:'newInstance';dest:number;callee:number}
  | {kind:'constructorResult';dest:number;result:number;instance:number}
  | {kind:'newArguments';dest:number;parameters:number[]} // -1: earlier duplicate, no mapping
  | {kind:'newObject';dest:number;array:boolean;length:number}
  | {kind:'property';strict?:boolean;operation:'get'|'delete'|'has';dest:number;object:number;key:number}
  | {kind:'setProperty';strict?:boolean;object:number;key:number;source:number;define:boolean}
  | {kind:'defineAccessor';object:number;key:number;source:number;setter:boolean}
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
export interface FunctionIR {id:string;name:string;parameterCount:number;localCount:number;slotCount:number;maxArguments:number;handlerCount?:number;blocks:BlockIR[]}
export interface ModuleIR {globalCount:number;functions:FunctionIR[];globalProperties?:{name:string;index:number}[];globalFunctionProperties?:string[]}
