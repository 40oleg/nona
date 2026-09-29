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
  const lexicals:LexicalDeclaration[]=[],vars:A.Identifier[]=[],bodyFunctions:A.FunctionDeclaration[]=[];
  // Module export declarations declare their inner statement.
  const unwrap=(list:readonly A.Statement[]):A.Statement[]=>list.map(s=>s.kind==='Export'&&s.declaration?s.declaration:s);
  statements=unwrap(statements);
  for(const statement of statements){
    if(statement.kind==='Var'&&statement.declarationKind!=='var')for(const declaration of statement.declarations)
      for(const id of boundNames(declaration.id))lexicals.push({name:id.name,id,kind:statement.declarationKind,statement});
    if(statement.kind==='Function'){
      if(functionDeclarationKind==='var')bodyFunctions.push(statement);
      else lexicals.push({name:statement.id.name,id:statement.id,kind:'function',statement});
    }
    if(statement.kind==='Class')lexicals.push({name:statement.id.name,id:statement.id,kind:'class',statement});
  }
  const visitVars=(list:readonly A.Statement[]):void=>{
    for(const statement of list)switch(statement.kind){
      case 'Var':if(statement.declarationKind==='var')for(const declaration of statement.declarations)vars.push(...boundNames(declaration.id));break;
      case 'Try':visitVars(statement.body.body);if(statement.handler)visitVars(statement.handler.body);if(statement.finalizer)visitVars(statement.finalizer.body);break;
      case 'Block':visitVars(statement.body);break;
      case 'If':visitVars([statement.consequent,...(statement.alternate?[statement.alternate]:[])]);break;
      case 'While':case 'DoWhile':case 'Labeled':case 'With':visitVars([statement.body]);break;
      case 'Switch':for(const clause of statement.cases)visitVars(clause.body);break;
      case 'For':if(statement.init?.kind==='Var')visitVars([statement.init]);visitVars([statement.body]);break;
      case 'ForIn':case 'ForOf':if(statement.left.kind==='Var')visitVars([statement.left]);visitVars([statement.body]);break;
    }
  };
  visitVars(statements);
  return {lexicals,vars,bodyFunctions};
}
