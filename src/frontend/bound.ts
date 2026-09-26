import type { Program, FunctionNode, Node } from './ast.js';
export type StorageBinding={kind:'global'|'local'|'parameter';index:number;name:string;owner:number;captured?:boolean;lexical?:boolean;mutable?:boolean;silentImmutable?:boolean};
export type Binding=StorageBinding|{kind:'globalProperty';name:string};
export interface BoundFunction { strict:boolean;declaration:FunctionNode; index:number;parent:BoundFunction|null;parameters:StorageBinding[];restParameter?:StorageBinding;locals:StorageBinding[];captures:StorageBinding[];declarations:BoundFunction[];self?:StorageBinding;argumentsBinding?:StorageBinding }
export interface BoundProgram { ast:Program;globals:StorageBinding[];mainLocals:StorageBinding[];functions:BoundFunction[];declarations:BoundFunction[];functionNodes:Map<FunctionNode,BoundFunction>;bindings:Map<Node,Binding>;lexicalScopes:Map<Node,StorageBinding[]>;scopeFunctions:Map<Node,BoundFunction[]> }
