import type { Span } from '../source.js';
export interface Node { kind: string; span: Span }
export interface Program extends Node { kind: 'Program'; body: Statement[]; source?:string;strict?:boolean }
export interface Block extends Node { kind: 'Block'; body: Statement[];strict?:boolean }
export interface Identifier extends Node { kind: 'Identifier'; name: string }
export interface BindingElement {id:BindingPattern;init:Expression|null}
export interface ArrayPattern extends Node {kind:'ArrayPattern';elements:(BindingElement|null)[];rest:BindingPattern|null}
export interface ObjectPattern extends Node {kind:'ObjectPattern';properties:{key:Expression;value:BindingElement;computed:boolean}[];rest:BindingPattern|null}
export type BindingPattern=Identifier|Member|ArrayPattern|ObjectPattern;
export interface NewTarget extends Node {kind:'NewTarget'}
export interface Super extends Node {kind:'Super'}
export interface This extends Node {kind:'This'}
export interface Literal extends Node { kind: 'Literal'; value: string|number|bigint|boolean|null|undefined }
export interface RegExpLiteral extends Node {kind:'RegExpLiteral';pattern:string;flags:string}
export interface Unary extends Node { kind: 'Unary'; operator: string; argument: Expression }
export interface Member extends Node {kind:'Member';object:Expression;property:Expression}
export type Assignable = Identifier|Member;
export interface ObjectLiteral extends Node {kind:'ObjectLiteral';trailingCommaAfterSpread?:boolean;properties:({key:Expression;value:Expression;prototype:boolean;computed?:boolean;coverInitialized?:boolean;accessor?:'get'|'set'}|{spread:Expression})[]}
export interface SpreadElement extends Node {kind:'SpreadElement';argument:Expression}
export interface ArrayLiteral extends Node {kind:'ArrayLiteral';trailingCommaAfterSpread?:boolean;elements:(Expression|SpreadElement|null)[]}
export interface Template extends Node {kind:'Template';quasis:string[];expressions:Expression[]}
export interface TaggedTemplate extends Node {kind:'TaggedTemplate';tag:Expression;quasis:(string|undefined)[];rawQuasis:string[];expressions:Expression[]}
export interface Yield extends Node {kind:'Yield';argument:Expression|null;delegate:boolean}
export interface Update extends Node { kind: 'Update'; operator: string; argument: Assignable; prefix: boolean }
export interface Binary extends Node { kind: 'Binary'; operator: string; left: Expression; right: Expression }
export interface Assignment extends Node { kind: 'Assignment'; operator: string; left: Assignable|ArrayPattern|ObjectPattern; right: Expression }
export interface Conditional extends Node { kind: 'Conditional'; test: Expression; consequent: Expression; alternate: Expression }
export type Argument=Expression|SpreadElement;
export interface Call extends Node { kind: 'Call'; callee: Expression; arguments: Argument[] }
export interface New extends Node {kind:'New';callee:Expression;arguments:Argument[]}
export type OptionalLink=
  | {kind:'property';property:Expression;computed:boolean;optional:boolean;span:Span}
  | {kind:'call';arguments:Argument[];optional:boolean;span:Span};
export interface OptionalChain extends Node {kind:'OptionalChain';base:Expression;links:OptionalLink[]}
export type Expression = NewTarget|Super|This|Identifier|Literal|RegExpLiteral|Unary|Update|Binary|Assignment|Conditional|Call|New|Member|OptionalChain|ObjectLiteral|ArrayLiteral|Template|TaggedTemplate|Yield|FunctionExpression|ClassExpression;
export interface Var extends Node { kind: 'Var'; declarationKind:'var'|'let'|'const'; declarations: { id: BindingPattern; init: Expression|null }[] }
export interface FunctionDeclaration extends Node { kind: 'Function'; generator?:boolean; id: Identifier; parameters: BindingPattern[]; defaults?:(Expression|null)[]; rest?:BindingPattern|null; body: Block }
export interface FunctionExpression extends Node {kind:'FunctionExpression';generator?:boolean;method?:boolean;classMethod?:boolean;classConstructor?:boolean;derivedConstructor?:boolean;defaultClassConstructor?:boolean;arrow?:boolean;id:Identifier|null;parameters:BindingPattern[];defaults?:(Expression|null)[];rest?:BindingPattern|null;body:Block}
export interface ClassMethod {key:Expression;computed:boolean;isStatic:boolean;accessor?:'get'|'set';value:FunctionExpression}
export interface ClassExpression extends Node {kind:'ClassExpression';id:Identifier|null;superClass:Expression|null;methods:ClassMethod[];constructorMethod:FunctionExpression}
export interface ClassDeclaration extends Node {kind:'Class';id:Identifier;superClass:Expression|null;methods:ClassMethod[];constructorMethod:FunctionExpression}
export type FunctionNode=FunctionDeclaration|FunctionExpression;
export interface ExpressionStatement extends Node { kind: 'ExpressionStatement'; expression: Expression }
export interface If extends Node { kind: 'If'; test: Expression; consequent: Statement; alternate: Statement|null }
export interface While extends Node { kind: 'While'; test: Expression; body: Statement }
export interface DoWhile extends Node { kind: 'DoWhile'; test: Expression; body: Statement }
export interface Switch extends Node { kind: 'Switch'; discriminant: Expression; cases: {test:Expression|null;body:Statement[]}[] }
export interface Labeled extends Node { kind: 'Labeled'; label: Identifier; body: Statement }
export interface For extends Node { kind: 'For'; init: Var|Expression|null; test: Expression|null; update: Expression|null; body: Statement }
export interface ForIn extends Node {kind:'ForIn';left:Var|Assignable;right:Expression;body:Statement}
export interface ForOf extends Node {kind:'ForOf';left:Var|Assignable;right:Expression;body:Statement}
export interface Throw extends Node {kind:'Throw';argument:Expression}
export interface Try extends Node {kind:'Try';body:Block;parameter:Identifier|null;handler:Block|null;finalizer:Block|null}
export interface Return extends Node { kind: 'Return'; argument: Expression|null }
export interface Simple extends Node { kind: 'Empty'|'Debugger' }
export interface Jump extends Node { kind: 'Break'|'Continue'; label:Identifier|null }
export type Statement = Throw|Try|Block|Var|FunctionDeclaration|ClassDeclaration|ExpressionStatement|If|While|DoWhile|Switch|Labeled|For|ForIn|ForOf|Return|Simple|Jump;
