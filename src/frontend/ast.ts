import type { Span } from '../source.js';
export interface Node { kind: string; span: Span }
export interface Program extends Node { kind: 'Program'; body: Statement[]; source?:string;strict?:boolean }
export interface Block extends Node { kind: 'Block'; body: Statement[];strict?:boolean }
export interface Identifier extends Node { kind: 'Identifier'; name: string }
export interface NewTarget extends Node {kind:'NewTarget'}
export interface Super extends Node {kind:'Super'}
export interface This extends Node {kind:'This'}
export interface Literal extends Node { kind: 'Literal'; value: string|number|boolean|null|undefined }
export interface Unary extends Node { kind: 'Unary'; operator: string; argument: Expression }
export interface Member extends Node {kind:'Member';object:Expression;property:Expression}
export type Assignable = Identifier|Member;
export interface ObjectLiteral extends Node {kind:'ObjectLiteral';properties:{key:Expression;value:Expression;prototype:boolean;accessor?:'get'|'set'}[]}
export interface ArrayLiteral extends Node {kind:'ArrayLiteral';elements:(Expression|null)[]}
export interface Update extends Node { kind: 'Update'; operator: string; argument: Assignable; prefix: boolean }
export interface Binary extends Node { kind: 'Binary'; operator: string; left: Expression; right: Expression }
export interface Assignment extends Node { kind: 'Assignment'; operator: string; left: Assignable; right: Expression }
export interface Conditional extends Node { kind: 'Conditional'; test: Expression; consequent: Expression; alternate: Expression }
export interface Call extends Node { kind: 'Call'; callee: Expression; arguments: Expression[] }
export interface New extends Node {kind:'New';callee:Expression;arguments:Expression[]}
export type OptionalLink=
  | {kind:'property';property:Expression;computed:boolean;optional:boolean;span:Span}
  | {kind:'call';arguments:Expression[];optional:boolean;span:Span};
export interface OptionalChain extends Node {kind:'OptionalChain';base:Expression;links:OptionalLink[]}
export type Expression = NewTarget|Super|This|Identifier|Literal|Unary|Update|Binary|Assignment|Conditional|Call|New|Member|OptionalChain|ObjectLiteral|ArrayLiteral|FunctionExpression;
export interface Var extends Node { kind: 'Var'; declarationKind:'var'|'let'|'const'; declarations: { id: Identifier; init: Expression|null }[] }
export interface FunctionDeclaration extends Node { kind: 'Function'; id: Identifier; parameters: Identifier[]; body: Block }
export interface FunctionExpression extends Node {kind:'FunctionExpression';method?:boolean;id:Identifier|null;parameters:Identifier[];body:Block}
export type FunctionNode=FunctionDeclaration|FunctionExpression;
export interface ExpressionStatement extends Node { kind: 'ExpressionStatement'; expression: Expression }
export interface If extends Node { kind: 'If'; test: Expression; consequent: Statement; alternate: Statement|null }
export interface While extends Node { kind: 'While'; test: Expression; body: Statement }
export interface DoWhile extends Node { kind: 'DoWhile'; test: Expression; body: Statement }
export interface Switch extends Node { kind: 'Switch'; discriminant: Expression; cases: {test:Expression|null;body:Statement[]}[] }
export interface Labeled extends Node { kind: 'Labeled'; label: Identifier; body: Statement }
export interface For extends Node { kind: 'For'; init: Var|Expression|null; test: Expression|null; update: Expression|null; body: Statement }
export interface Throw extends Node {kind:'Throw';argument:Expression}
export interface Try extends Node {kind:'Try';body:Block;parameter:Identifier|null;handler:Block|null;finalizer:Block|null}
export interface Return extends Node { kind: 'Return'; argument: Expression|null }
export interface Simple extends Node { kind: 'Empty'|'Debugger' }
export interface Jump extends Node { kind: 'Break'|'Continue'; label:Identifier|null }
export type Statement = Throw|Try|Block|Var|FunctionDeclaration|ExpressionStatement|If|While|DoWhile|Switch|Labeled|For|Return|Simple|Jump;
