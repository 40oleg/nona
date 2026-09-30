import type * as A from './ast.js';

export type LexicalDeclaration={
  name:string;
  id:A.Identifier;
  kind:'let'|'const'|'function'|'class';
  statement:A.Var|A.FunctionDeclaration|A.ClassDeclaration;
};

export interface DeclarationInfo {
  lexicals:LexicalDeclaration[];
  vars:A.Identifier[];
  bodyFunctions:A.FunctionDeclaration[];
  /** Plain function declarations in nested blocks/switch clauses (Annex B.3.3 candidates). */
  blockFunctions:A.FunctionDeclaration[];
}
export function boundNames(pattern:A.BindingPattern):A.Identifier[]{
 if(pattern.kind==='Identifier')return [pattern];
 if(pattern.kind==='Member')return [];
 if(pattern.kind==='ObjectPattern')return [...pattern.properties.flatMap(property=>boundNames(property.value.id)),...(pattern.rest?boundNames(pattern.rest):[])];
 return [...pattern.elements.flatMap(element=>element?boundNames(element.id):[]),...(pattern.rest?boundNames(pattern.rest):[])];
}

export function collectDeclarations(
  statements:readonly A.Statement[],
  functionDeclarationKind:'var'|'lexical',
):DeclarationInfo {
  const lexicals:LexicalDeclaration[]=[],vars:A.Identifier[]=[],bodyFunctions:A.FunctionDeclaration[]=[],blockFunctions:A.FunctionDeclaration[]=[];
  // Module export declarations declare their inner statement.
  const unwrap=(list:readonly A.Statement[]):A.Statement[]=>list.map(s=>s.kind==='Export'&&s.declaration?s.declaration:s);
  statements=unwrap(statements);
  // A labelled function declaration declares the function (Annex B.3.2).
  const unlabel=(s:A.Statement):A.Statement=>s.kind==='Labeled'?unlabel(s.body):s;
  for(const raw of statements){
    const statement=raw.kind==='Labeled'&&unlabel(raw).kind==='Function'?unlabel(raw):raw;
    if(statement.kind==='Var'&&statement.declarationKind!=='var')for(const declaration of statement.declarations)
      for(const id of boundNames(declaration.id))lexicals.push({name:id.name,id,kind:statement.declarationKind,statement});
    if(statement.kind==='Function'){
      if(functionDeclarationKind==='var')bodyFunctions.push(statement);
      else lexicals.push({name:statement.id.name,id:statement.id,kind:'function',statement});
    }
    if(statement.kind==='Class')lexicals.push({name:statement.id.name,id:statement.id,kind:'class',statement});
  }
  // Lexical names declared directly in a statement list (let/const/class/function).
  const lexicalNames=(list:readonly A.Statement[],functions:boolean):Set<string>=>{
    const names=new Set<string>();
    for(const statement of list){
      if(statement.kind==='Var'&&statement.declarationKind!=='var')for(const d of statement.declarations)for(const id of boundNames(d.id))names.add(id.name);
      if(statement.kind==='Class')names.add(statement.id.name);
      if(functions&&statement.kind==='Function')names.add(statement.id.name);
    }
    return names;
  };
  // outer: lexical names of enclosing blocks; a match makes `var F` an early error (B.3.3).
  const visitVars=(list:readonly A.Statement[],nested=false,outer:Set<string>[]=[]):void=>{
    const own=nested?lexicalNames(list,false):new Set<string>();
    const inner=nested?[...outer,lexicalNames(list,true)]:outer;
    for(const statement of list)switch(statement.kind){
      case 'Function':if(nested&&!statement.generator&&!statement.async&&!own.has(statement.id.name)&&!outer.some(names=>names.has(statement.id.name)))blockFunctions.push(statement);break;
      case 'Var':if(statement.declarationKind==='var')for(const declaration of statement.declarations)vars.push(...boundNames(declaration.id));break;
      case 'Try':
        visitVars(statement.body.body,true,inner);
        if(statement.handler)visitVars(statement.handler.body,true,statement.parameter&&statement.parameter.kind!=='Identifier'?[...inner,new Set(boundNames(statement.parameter).map(id=>id.name))]:inner);
        if(statement.finalizer)visitVars(statement.finalizer.body,true,inner);break;
      case 'Block':visitVars(statement.body,true,inner);break;
      case 'If':visitVars([statement.consequent,...(statement.alternate?[statement.alternate]:[])],true,inner);break;
      case 'While':case 'DoWhile':case 'Labeled':case 'With':visitVars([statement.body],nested,inner);break;
      case 'Switch':{const clauses=statement.cases.flatMap(clause=>clause.body);const scope=[...inner,lexicalNames(clauses,true)];const switchOwn=lexicalNames(clauses,false);
        for(const clause of statement.cases)visitVars(clause.body,true,[...inner,switchOwn]);
        void scope;break;}
      case 'For':{const loop=statement.init?.kind==='Var'&&statement.init.declarationKind!=='var'?[...inner,new Set(statement.init.declarations.flatMap(d=>boundNames(d.id).map(id=>id.name)))]:inner;
        if(statement.init?.kind==='Var')visitVars([statement.init]);visitVars([statement.body],nested,loop);break;}
      case 'ForIn':case 'ForOf':{const loop=statement.left.kind==='Var'&&statement.left.declarationKind!=='var'?[...inner,new Set(statement.left.declarations.flatMap(d=>boundNames(d.id).map(id=>id.name)))]:inner;
        if(statement.left.kind==='Var')visitVars([statement.left]);visitVars([statement.body],nested,loop);break;}
    }
  };
  visitVars(statements);
  return {lexicals,vars,bodyFunctions,blockFunctions};
}
