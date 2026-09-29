import type { Program, FunctionNode, Node } from './ast.js';
import type {ModuleRecord} from './modules.js';
/** A module environment: its namespace/import.meta storage and namespace getters. */
export interface BoundModule {record:ModuleRecord;namespace:StorageBinding;meta:StorageBinding;exportNames:string[];getters:BoundFunction[];/** Link failure of a module only reachable through import(); rejects that import at run time. */linkError?:string}
export type StorageBinding={kind:'global'|'local'|'parameter';index:number;name:string;owner:number;captured?:boolean;lexical?:boolean;mutable?:boolean;silentImmutable?:boolean;module?:boolean};
export type Binding=StorageBinding|{kind:'globalProperty';name:string};
export interface BoundFunction { module?:number;strict:boolean;declaration:FunctionNode; index:number;parent:BoundFunction|null;parameters:StorageBinding[];restParameter?:StorageBinding;locals:StorageBinding[];captures:StorageBinding[];declarations:BoundFunction[];self?:StorageBinding;argumentsBinding?:StorageBinding }
export interface BoundProgram { ast:Program;globals:StorageBinding[];mainLocals:StorageBinding[];functions:BoundFunction[];declarations:BoundFunction[];functionNodes:Map<FunctionNode,BoundFunction>;bindings:Map<Node,Binding>;withChains:Map<Node,StorageBinding[]>;modules?:BoundModule[];lexicalScopes:Map<Node,StorageBinding[]>;scopeFunctions:Map<Node,BoundFunction[]> }
