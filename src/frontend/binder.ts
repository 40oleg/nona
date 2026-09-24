import {CompileError} from '../diagnostics.js';
import {immutableGlobalNames,runtimeGlobalNames} from '../global-builtins.js';
import type * as A from './ast.js';
import type {Binding,StorageBinding,BoundFunction,BoundProgram} from './bound.js';
import {collectDeclarations} from './declarations.js';

export function bind(ast:A.Program):BoundProgram {
  const globals:StorageBinding[]=[],mainLocals:StorageBinding[]=[],functions:BoundFunction[]=[],bindings=new Map<A.Node,Binding>();
  const declarations:BoundFunction[]=[],functionNodes=new Map<A.FunctionNode,BoundFunction>();
  const lexicalScopes=new Map<A.Node,StorageBinding[]>(),scopeFunctions=new Map<A.Node,BoundFunction[]>(),globalNames=new Map<string,Binding>();
  const argumentOwners=new Map<StorageBinding,BoundFunction>();
  const catchBindings=new Set<Binding>();
  const fail=(node:A.Node,message:string):never=>{throw new CompileError([{code:'E_BIND',message,file:'',span:node.span}]);};
  const register=(node:A.FunctionNode,parent:BoundFunction|null):BoundFunction=>{
    const entry:BoundFunction={strict:!!(node.body.strict||(parent?parent.strict:ast.strict)),declaration:node,index:functions.length,parent,parameters:[],locals:[],captures:[],declarations:[]};
    functions.push(entry);functionNodes.set(node,entry);return entry;
  };
  const analyze=(body:A.Statement[],fn:BoundFunction|null,owner:A.Node,outerScopes:Map<string,Binding>[]=[]):void=>{
    const strict=fn?.strict??!!ast.strict;
    const checkName=(id:A.Identifier)=>{if(strict&&(id.name==='eval'||id.name==='arguments'))fail(id,'Restricted strict binding');};
    if(fn?.declaration.id)checkName(fn.declaration.id);
    const functionNames=fn?new Map<string,Binding>():globalNames;
    if(fn){
      for(const p of fn.declaration.parameters){
        // Each actual position retains an input slot; only the last occurrence
        // of a simple sloppy parameter name is visible in the function scope.
        checkName(p);if(strict&&functionNames.has(p.name))fail(p,'Duplicate strict parameter');
        const b:StorageBinding={kind:'parameter',name:p.name,index:fn.locals.length,owner:fn.index};
        functionNames.set(p.name,b);fn.parameters.push(b);fn.locals.push(b);bindings.set(p,b);
      }
    }
    const variable=(id:A.Identifier,functionDeclaration=false):void=>{
      checkName(id);let b=functionNames.get(id.name);
      if(!fn&&functionDeclaration&&immutableGlobalNames.has(id.name))fail(id,'Restricted global function declaration');
      if(!b&&!fn&&runtimeGlobalNames.has(id.name)){
        b={kind:'globalProperty',name:id.name};functionNames.set(id.name,b);
      }
      if(!b){
        const storage=fn?fn.locals:globals;
        b={kind:fn?'local':'global',name:id.name,index:storage.length,owner:fn?.index??-1};
        storage.push(b);functionNames.set(id.name,b);
      }
      bindings.set(id,b);
    };
    const bodyDeclarations=collectDeclarations(body,'var');
    for(const statement of bodyDeclarations.bodyFunctions){
      variable(statement.id,true);(fn?.declarations??declarations).push(register(statement,fn));
    }
    bodyDeclarations.vars.forEach(id=>variable(id));
    const scopes=[...outerScopes],labels=new Map<string,boolean>();
    if(fn?.declaration.kind==='FunctionExpression'&&fn.declaration.id){
      checkName(fn.declaration.id);
      const self:StorageBinding={kind:'local',name:fn.declaration.id.name,index:fn.locals.length,owner:fn.index,mutable:false,silentImmutable:!strict};
      fn.self=self;fn.locals.push(self);bindings.set(fn.declaration.id,self);scopes.push(new Map([[self.name,self]]));
    }
    scopes.push(functionNames);
    const declareLexicals=(node:A.Node,statements:A.Statement[],scope:Map<string,Binding>,functionKind:'var'|'lexical'):void=>{
      const entries:StorageBinding[]=[],info=collectDeclarations(statements,functionKind),varNames=new Set(info.vars.map(id=>id.name));
      for(const declaration of info.lexicals){
        const d={id:declaration.id};
        checkName(d.id);
        if(!fn&&node===owner&&immutableGlobalNames.has(d.id.name))fail(d.id,'Restricted global lexical declaration');
        if(scope.has(d.id.name)||varNames.has(d.id.name))fail(d.id,'Duplicate or conflicting lexical declaration');
        // Only script-level lexicals belong to the persistent global environment.
        // Nested scopes in main use frame slots, just like scopes in a function.
        const storage=fn?fn.locals:node===owner?globals:mainLocals;
        const b:StorageBinding={kind:storage===globals?'global':'local',name:d.id.name,index:storage.length,owner:fn?.index??-1,lexical:true,mutable:declaration.kind!=='const'};
        storage.push(b);
        scope.set(d.id.name,b);bindings.set(d.id,b);entries.push(b);
        if(declaration.kind==='function'){
          const blockFunction=register(declaration.statement as A.FunctionDeclaration,fn);
          const list=scopeFunctions.get(node)??[];list.push(blockFunction);scopeFunctions.set(node,list);
        }
      }
      lexicalScopes.set(node,entries);
    };
    declareLexicals(owner,body,functionNames,'var');
    if(fn){
      const existing=functionNames.get('arguments');
      const shadowed=existing&&(existing.kind==='parameter'||'lexical'in existing&&existing.lexical)||body.some(s=>s.kind==='Function'&&s.id.name==='arguments');
      if(!shadowed){
        const candidate=(existing??{kind:'local',name:'arguments',index:-1,owner:fn.index}) as StorageBinding;
        functionNames.set('arguments',candidate);argumentOwners.set(candidate,fn);
      }
    }
    const scoped=(node:A.Node,statements:A.Statement[],action:()=>void):void=>{
      const scope=new Map<string,Binding>();declareLexicals(node,statements,scope,'lexical');
      scopes.push(scope);action();scopes.pop();
    };
    const resolve=(id:A.Identifier,mode:'value'|'write'|'call'|'typeof'='value'):Binding=>{
      if(strict&&mode==='write'&&(id.name==='eval'||id.name==='arguments'))fail(id,'Restricted strict assignment');
      let b:Binding|undefined;
      for(let i=scopes.length-1;i>=0&&!b;i--)b=scopes[i]!.get(id.name);
      b??=globalNames.get(id.name);
      if(!b)b={kind:'globalProperty',name:id.name};
      const result=b!;
      if(result.kind==='local'){
        const argumentsOwner=argumentOwners.get(result);
        if(argumentsOwner){
          if(result.index<0){result.index=argumentsOwner.locals.length;argumentsOwner.locals.push(result);}
          argumentsOwner.argumentsBinding=result;
          if(!argumentsOwner.strict)for(const parameter of new Map(argumentsOwner.parameters.map(p=>[p.name,p])).values())parameter.captured=true;
        }
      }
      if(fn&&(result.kind==='local'||result.kind==='parameter')&&result.owner!==fn.index){
        result.captured=true;
        for(let current:BoundFunction|null=fn;current&&current.index!==result.owner;current=current.parent)
          if(!current.captures.includes(result))current.captures.push(result);
      }
      bindings.set(id,result);return result;
    };
    const expression=(e:A.Expression):void=>{
      switch(e.kind){
        case 'NewTarget':if(!fn)fail(e,'new.target requires a function');break;
        case 'Super':if(fn?.declaration.kind!=='FunctionExpression'||!fn.declaration.method)fail(e,'Super property requires a method');break;
        case 'This':case 'Literal':break;
        case 'FunctionExpression':{
          const nested=register(e,fn);analyze(e.body.body,nested,e.body,scopes);break;
        }
        case 'Identifier':resolve(e);break;
        case 'Unary':if(strict&&e.operator==='delete'&&e.argument.kind==='Identifier')fail(e,'Strict delete of identifier');if((e.operator==='typeof'||e.operator==='delete')&&e.argument.kind==='Identifier')resolve(e.argument,'typeof');else expression(e.argument);break;
        case 'Update':if(e.argument.kind==='Identifier')resolve(e.argument,'write');else expression(e.argument);break;
        case 'Assignment':if(e.left.kind==='Identifier')resolve(e.left,'write');else expression(e.left);expression(e.right);break;
        case 'Member':expression(e.object);expression(e.property);break;
        case 'OptionalChain':expression(e.base);for(const link of e.links)if(link.kind==='property')expression(link.property);else link.arguments.forEach(expression);break;
        case 'ArrayLiteral':for(const item of e.elements)if(item)expression(item);break;
        case 'ObjectLiteral':for(const p of e.properties){expression(p.key);expression(p.value);}break;
        case 'Binary':expression(e.left);expression(e.right);break;
        case 'Conditional':expression(e.test);expression(e.consequent);expression(e.alternate);break;
        case 'New':case 'Call':if(e.callee.kind==='Identifier')resolve(e.callee,'call');else expression(e.callee);e.arguments.forEach(expression);break;
      }
    };
    const statements=(list:A.Statement[],loops:number,switches=0):void=>{
      for(const s of list)switch(s.kind){
        case 'Function':{
          const nested=functionNodes.get(s)!;analyze(s.body.body,nested,s.body,scopes);break;
        }
        case 'Throw':expression(s.argument);break;
        case 'Try':{
          statements([s.body],loops,switches);
          const scope=new Map<string,Binding>();
          if(s.parameter){checkName(s.parameter);const storage=fn?fn.locals:mainLocals;const binding:StorageBinding={kind:'local',name:s.parameter.name,index:storage.length,owner:fn?.index??-1,lexical:true,mutable:true};storage.push(binding);catchBindings.add(binding);bindings.set(s.parameter,binding);scope.set(binding.name,binding);
            for(const declaration of collectDeclarations(s.handler!.body,'lexical').lexicals)
              if(declaration.name===binding.name)fail(declaration.id,'Catch parameter conflicts with lexical declaration');
          }
          if(s.handler){scopes.push(scope);statements([s.handler],loops,switches);scopes.pop();}
          if(s.finalizer)statements([s.finalizer],loops,switches);break;
        }
        case 'Empty':case 'Debugger':break;
        case 'Var':for(const d of s.declarations)if(d.init){if(s.declarationKind==='var'){const visible=[...scopes].reverse().map(scope=>scope.get(d.id.name)).find(Boolean);if(visible&&catchBindings.has(visible))resolve(d.id,'write');}expression(d.init);}break;
        case 'Block':scoped(s,s.body,()=>statements(s.body,loops,switches));break;
        case 'ExpressionStatement':expression(s.expression);break;
        case 'If':expression(s.test);statements([s.consequent],loops,switches);if(s.alternate)statements([s.alternate],loops,switches);break;
        case 'While':case 'DoWhile':expression(s.test);statements([s.body],loops+1,switches);break;
        case 'For':scoped(s,[...(s.init?.kind==='Var'?[s.init]:[]),s.body],()=>{
          if(s.init){if(s.init.kind==='Var')statements([s.init],loops,switches);else expression(s.init);}
          if(s.test)expression(s.test);if(s.update)expression(s.update);statements([s.body],loops+1,switches);
        });break;
        case 'Switch':
          expression(s.discriminant);
          scoped(s,s.cases.flatMap(c=>c.body),()=>{
            for(const c of s.cases){if(c.test)expression(c.test);statements(c.body,loops,switches+1);}
          });break;
        case 'Labeled': {
          if(labels.has(s.label.name))fail(s.label,'Duplicate label');
          let target=s.body;while(target.kind==='Labeled')target=target.body;
          labels.set(s.label.name,['While','DoWhile','For'].includes(target.kind));
          statements([s.body],loops,switches);labels.delete(s.label.name);break;
        }
        case 'Return':if(!fn)fail(s,'return outside function');if(s.argument)expression(s.argument);break;
        case 'Break':case 'Continue':
          if(s.label){
            if(!labels.has(s.label.name))fail(s.label,'Unknown label');
            if(s.kind==='Continue'&&!labels.get(s.label.name))fail(s.label,'Continue label must name a loop');
          }else if(!loops&&(s.kind==='Continue'||!switches))fail(s,`${s.kind.toLowerCase()} outside loop or switch`);
          break;
      }
    };
    statements(body,0);
  };
  analyze(ast.body,null,ast);
  return {ast,globals,mainLocals,functions,declarations,functionNodes,bindings,lexicalScopes,scopeFunctions};
}
