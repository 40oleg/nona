import type * as A from './ast.js';

export type LexicalDeclaration={
  name:string;
  id:A.Identifier;
  kind:'let'|'const'|'function';
  statement:A.Var|A.FunctionDeclaration;
};

export interface DeclarationInfo {
  lexicals:LexicalDeclaration[];
  vars:A.Identifier[];
  bodyFunctions:A.FunctionDeclaration[];
}

export function collectDeclarations(
  statements:readonly A.Statement[],
  functionDeclarationKind:'var'|'lexical',
):DeclarationInfo {
  const lexicals:LexicalDeclaration[]=[],vars:A.Identifier[]=[],bodyFunctions:A.FunctionDeclaration[]=[];
  for(const statement of statements){
    if(statement.kind==='Var'&&statement.declarationKind!=='var')for(const declaration of statement.declarations)
      lexicals.push({name:declaration.id.name,id:declaration.id,kind:statement.declarationKind,statement});
    if(statement.kind==='Function'){
      if(functionDeclarationKind==='var')bodyFunctions.push(statement);
      else lexicals.push({name:statement.id.name,id:statement.id,kind:'function',statement});
    }
  }
  const visitVars=(list:readonly A.Statement[]):void=>{
    for(const statement of list)switch(statement.kind){
      case 'Var':if(statement.declarationKind==='var')for(const declaration of statement.declarations)vars.push(declaration.id);break;
      case 'Try':visitVars(statement.body.body);if(statement.handler)visitVars(statement.handler.body);if(statement.finalizer)visitVars(statement.finalizer.body);break;
      case 'Block':visitVars(statement.body);break;
      case 'If':visitVars([statement.consequent,...(statement.alternate?[statement.alternate]:[])]);break;
      case 'While':case 'DoWhile':case 'Labeled':visitVars([statement.body]);break;
      case 'Switch':for(const clause of statement.cases)visitVars(clause.body);break;
      case 'For':if(statement.init?.kind==='Var')visitVars([statement.init]);visitVars([statement.body]);break;
      case 'ForIn':case 'ForOf':if(statement.left.kind==='Var')visitVars([statement.left]);visitVars([statement.body]);break;
    }
  };
  visitVars(statements);
  return {lexicals,vars,bodyFunctions};
}
