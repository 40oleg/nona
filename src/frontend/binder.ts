import {strictReserved} from './parser.js';
import {CompileError} from '../diagnostics.js';
import {immutableGlobalNames,runtimeGlobalNames} from '../global-builtins.js';
import type * as A from './ast.js';
import type {Binding,StorageBinding,BoundFunction,BoundProgram,BoundModule} from './bound.js';
import type {ModuleRecord} from './modules.js';
import {boundNames,collectDeclarations} from './declarations.js';

/** A with statement's object environment: its hidden binding holds the object. */
class WithScope extends Map<string,Binding> {constructor(readonly binding:StorageBinding){super();}}

export function bind(ast:A.Program,moduleRecords?:ModuleRecord[]):BoundProgram {
  const globals:StorageBinding[]=[],mainLocals:StorageBinding[]=[],functions:BoundFunction[]=[],bindings=new Map<A.Node,Binding>();
  const declarations:BoundFunction[]=[],functionNodes=new Map<A.FunctionNode,BoundFunction>();
  const lexicalScopes=new Map<A.Node,StorageBinding[]>(),scopeFunctions=new Map<A.Node,BoundFunction[]>(),globalNames=new Map<string,Binding>();
  const argumentOwners=new Map<StorageBinding,BoundFunction>();
  const catchBindings=new Set<Binding>(),withChains=new Map<A.Node,StorageBinding[]>(),annexBFunctions=new Map<A.Node,Binding>();
  const fail=(node:A.Node,message:string):never=>{throw new CompileError([{code:'E_BIND',message,file:'',span:node.span}]);};
  let classCode=0; // > 0 while analyzing class heritage and element names (strict mode code)
  const register=(node:A.FunctionNode,parent:BoundFunction|null):BoundFunction=>{
    const entry:BoundFunction={...(currentModule===undefined?{}:{module:currentModule}),strict:node.kind==='FunctionExpression'&&node.dynamic?!!node.body.strict:!!(node.body.strict||classCode>0||currentModule!==undefined||node.kind==='FunctionExpression'&&node.classMethod||(parent?parent.strict:ast.strict)),declaration:node,index:functions.length,parent,parameters:[],locals:[],captures:[],declarations:[]};
    functions.push(entry);functionNodes.set(node,entry);return entry;
  };
  let currentModule:number|undefined;
  const importPlaceholders=new Set<Binding>();
  const analyze=(body:A.Statement[],fn:BoundFunction|null,owner:A.Node,outerScopes:Map<string,Binding>[]=[],moduleNames?:Map<string,Binding>):void=>{
    const strict=fn?.strict??(!!ast.strict||!!moduleNames);
    const nonSimple=!!fn&&(!!fn.declaration.rest||!!fn.declaration.defaults?.some(Boolean)||fn.declaration.parameters.some(p=>p.kind!=='Identifier'));
    let parameterArguments:StorageBinding|undefined;
    const checkName=(id:A.Identifier)=>{if(strict&&(id.name==='eval'||id.name==='arguments'||id.name==='yield'||id.name==='let'||strictReserved.has(id.name)))fail(id,'Restricted strict binding');};
    if(fn?.declaration.id)checkName(fn.declaration.id);
    const functionNames=fn?new Map<string,Binding>():moduleNames??globalNames;
    if(fn){
      if(nonSimple&&fn.declaration.body.strict)fail(fn.declaration,'Use strict directive with non-simple parameters');
      for(const [index,p] of fn.declaration.parameters.entries()){
        // Each actual position retains an input slot; only the last occurrence
        // of a simple sloppy parameter name is visible in the function scope.
        const b:StorageBinding={kind:'parameter',name:p.kind==='Identifier'?p.name:`#parameter${index}`,index:fn.locals.length,owner:fn.index};
        fn.parameters.push(b);fn.locals.push(b);
        if(p.kind==='Identifier'){
          checkName(p);if((strict||nonSimple||fn.declaration.kind==='FunctionExpression'&&fn.declaration.arrow)&&functionNames.has(p.name))fail(p,'Duplicate parameter');
          functionNames.set(p.name,b);bindings.set(p,b);
        }
      }
      for(const p of fn.declaration.parameters)if(p.kind!=='Identifier')for(const id of boundNames(p)){
        checkName(id);if(functionNames.has(id.name))fail(id,'Duplicate parameter');
        const b:StorageBinding={kind:'parameter',name:id.name,index:fn.locals.length,owner:fn.index};
        functionNames.set(id.name,b);fn.locals.push(b);bindings.set(id,b);
      }
      if(fn.declaration.rest){
        const p=fn.declaration.rest;
        const b:StorageBinding={kind:'parameter',name:p.kind==='Identifier'?p.name:'#rest',index:fn.locals.length,owner:fn.index};
        fn.restParameter=b;fn.locals.push(b);
        for(const id of boundNames(p)){
          checkName(id);if(functionNames.has(id.name))fail(id,'Duplicate parameter');
          const binding=id===p?b:{kind:'parameter' as const,name:id.name,index:fn.locals.length,owner:fn.index};
          if(binding!==b)fn.locals.push(binding);
          functionNames.set(id.name,binding);bindings.set(id,binding);
        }
      }
    }
    const variable=(id:A.Identifier,functionDeclaration=false):void=>{
      checkName(id);let b=functionNames.get(id.name);
      if(b&&importPlaceholders.has(b))fail(id,'Declaration conflicts with an import binding');
      if(!fn&&!moduleNames&&functionDeclaration&&immutableGlobalNames.has(id.name))fail(id,'Restricted global function declaration');
      if(!b&&!fn&&!moduleNames&&runtimeGlobalNames.has(id.name)){
        b={kind:'globalProperty',name:id.name};functionNames.set(id.name,b);
      }
      if(!b){
        const storage=fn?fn.locals:globals;
        b={kind:fn?'local':'global',name:id.name,index:storage.length,owner:fn?.index??-1,...(!fn&&moduleNames?{module:true}:{})};
        storage.push(b);functionNames.set(id.name,b);
      }
      bindings.set(id,b);
    };
    const bodyDeclarations=collectDeclarations(body,'var');
    for(const statement of bodyDeclarations.bodyFunctions){
      variable(statement.id,true);(fn?.declarations??declarations).push(register(statement,fn));
    }
    bodyDeclarations.vars.forEach(id=>variable(id));
    // Annex B.3.3.1/B.3.3.2: in sloppy code a plain function declared in a block also
    // gets a var binding (unless a parameter or top-level lexical has its name).
    if(!strict){
      const topLexicals=new Set(collectDeclarations(body,'var').lexicals.map(d=>d.name));
      const parameterNames=new Set(fn?.parameters.map(p=>p.name)??[]);
      for(const declaration of bodyDeclarations.blockFunctions){
        const name=declaration.id.name;
        if(topLexicals.has(name)||parameterNames.has(name)||name==='arguments'&&fn)continue;
        const existing=functionNames.get(name);if(existing&&'lexical'in existing&&existing.lexical)continue;
        variable({kind:'Identifier',name,span:declaration.id.span});
        annexBFunctions.set(declaration,functionNames.get(name)!);
      }
    }
    const scopes=[...outerScopes],labels=new Map<string,boolean>();
    if(fn?.declaration.kind==='FunctionExpression'&&fn.declaration.id){
      checkName(fn.declaration.id);
      const self:StorageBinding={kind:'local',name:fn.declaration.id.name,index:fn.locals.length,owner:fn.index,mutable:false,silentImmutable:!strict};
      fn.self=self;fn.locals.push(self);bindings.set(fn.declaration.id,self);scopes.push(new Map([[self.name,self]]));
    }
    scopes.push(functionNames);const functionScopeIndex=scopes.length-1;
    // Arrow functions may call super(); they reach the constructor through these hidden bindings.
    if(fn?.declaration.kind==='FunctionExpression'&&fn.declaration.derivedConstructor)
      for(const name of ['#superFunction','#superReceiver']){const b:StorageBinding={kind:'local',name,index:fn.locals.length,owner:fn.index};fn.locals.push(b);functionNames.set(name,b);}
    const declareLexicals=(node:A.Node,statements:A.Statement[],scope:Map<string,Binding>,functionKind:'var'|'lexical'):void=>{
      const entries:StorageBinding[]=[],info=collectDeclarations(statements,functionKind),varNames=new Set(info.vars.map(id=>id.name)),plainFunctionNames=new Set<string>();
      for(const declaration of info.lexicals){
        const d={id:declaration.id};
        checkName(d.id);
        if(!fn&&!moduleNames&&node===owner&&immutableGlobalNames.has(d.id.name))fail(d.id,'Restricted global lexical declaration');
        // Annex B.3.2.4: sloppy blocks may repeat a plain function declaration; the last one wins.
        const plain=(f:A.Statement)=>f.kind==='Function'&&!f.generator&&!f.async;
        if(!strict&&declaration.kind==='function'&&plain(declaration.statement)&&plainFunctionNames.has(d.id.name)&&scope.has(d.id.name)){
          const existing=scope.get(d.id.name)!;bindings.set(d.id,existing);
          const blockFunction=register(declaration.statement as A.FunctionDeclaration,fn);
          const list=scopeFunctions.get(node)??[];list.push(blockFunction);scopeFunctions.set(node,list);
          continue;
        }
        if(scope.has(d.id.name)||varNames.has(d.id.name))fail(d.id,'Duplicate or conflicting lexical declaration');
        if(declaration.kind==='function'&&plain(declaration.statement))plainFunctionNames.add(d.id.name);
        // Only script-level lexicals belong to the persistent global environment.
        // Nested scopes in main use frame slots, just like scopes in a function.
        const storage=fn?fn.locals:node===owner?globals:mainLocals;
        const b:StorageBinding={kind:storage===globals?'global':'local',name:d.id.name,index:storage.length,owner:fn?.index??-1,lexical:true,mutable:declaration.kind!=='const',...(storage===globals&&moduleNames?{module:true}:{})};
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
    if(fn&&!(fn.declaration.kind==='FunctionExpression'&&fn.declaration.arrow)){
      const existing=functionNames.get('arguments');
      const parameterName=fn.parameters.some(p=>p.name==='arguments');
      const shadowed=existing&&(existing.kind==='parameter'||'lexical'in existing&&existing.lexical)||body.some(s=>s.kind==='Function'&&s.id.name==='arguments');
      if(nonSimple&&!parameterName){
        parameterArguments={kind:'local',name:'arguments',index:-1,owner:fn.index};
        argumentOwners.set(parameterArguments,fn);
        if(!shadowed)functionNames.set('arguments',parameterArguments);
      }else if(!shadowed){
        const candidate=(existing??{kind:'local',name:'arguments',index:-1,owner:fn.index}) as StorageBinding;
        functionNames.set('arguments',candidate);argumentOwners.set(candidate,fn);
      }
    }
    const scoped=(node:A.Node,statements:A.Statement[],action:()=>void):void=>{
      const scope=new Map<string,Binding>();declareLexicals(node,statements,scope,'lexical');
      // A lexical binding of the same name between the block and the function scope
      // would make `var F` an early error, so B.3.3 does not apply.
      for(const statement of statements)if(statement.kind==='Function'&&annexBFunctions.has(statement)){
        for(let i=functionScopeIndex+1;i<scopes.length;i++){
          const s=scopes[i]!;if(s instanceof WithScope)continue;
          const b=s.get(statement.id.name);
          if(b&&'lexical'in b&&b.lexical&&!catchBindings.has(b)){annexBFunctions.delete(statement);break;}
        }
      }
      scopes.push(scope);action();scopes.pop();
    };
    const resolve=(id:A.Identifier,mode:'value'|'write'|'call'|'typeof'='value'):Binding=>{
      if(strict&&(id.name==='yield'||id.name==='let'||strictReserved.has(id.name)))fail(id,'Restricted strict identifier');
      if(strict&&mode==='write'&&(id.name==='eval'||id.name==='arguments'))fail(id,'Restricted strict assignment');
      let b:Binding|undefined;const withs:StorageBinding[]=[];
      for(let i=scopes.length-1;i>=0&&!b;i--){const scope=scopes[i]!;if(scope instanceof WithScope)withs.push(scope.binding);else b=scope.get(id.name);}
      b??=globalNames.get(id.name);
      if(!b)b={kind:'globalProperty',name:id.name};
      const result=b!;
      if(result.kind==='local'){
        const argumentsOwner=argumentOwners.get(result);
        if(argumentsOwner){
          if(result.index<0){result.index=argumentsOwner.locals.length;argumentsOwner.locals.push(result);}
          argumentsOwner.argumentsBinding=result;
          if(!argumentsOwner.strict&&!argumentsOwner.declaration.rest&&!argumentsOwner.declaration.defaults?.some(Boolean)&&argumentsOwner.declaration.parameters.every(p=>p.kind==='Identifier'))for(const parameter of new Map(argumentsOwner.parameters.map(p=>[p.name,p])).values())parameter.captured=true;
        }
      }
      const use=(storage:Binding):void=>{
        if(fn&&(storage.kind==='local'||storage.kind==='parameter')&&storage.owner!==fn.index){
          storage.captured=true;
          for(let current:BoundFunction|null=fn;current&&current.index!==storage.owner;current=current.parent)
            if(!current.captures.includes(storage))current.captures.push(storage);
        }
      };
      use(result);withs.forEach(use);
      if(withs.length)withChains.set(id,withs);
      bindings.set(id,result);return result;
    };
    const expression=(e:A.Expression):void=>{
      switch(e.kind){
        case 'NewTarget':{
          let owner=fn;while(owner?.declaration.kind==='FunctionExpression'&&owner.declaration.arrow)owner=owner.parent;
          if(!owner)fail(e,'new.target requires a non-arrow function');break;
        }
        case 'Super':{
          let owner=fn;while(owner?.declaration.kind==='FunctionExpression'&&owner.declaration.arrow)owner=owner.parent;
          if(owner?.declaration.kind!=='FunctionExpression'||!owner.declaration.method)fail(e,'Super property requires a method');break;
        }
        case 'Literal':if(strict&&e.legacyOctal)fail(e,'Legacy octal literals and escapes are not allowed in strict mode');break;
        case 'This':case 'RegExpLiteral':case 'ImportMeta':break;
        case 'ImportCall':expression(e.argument);break;
        case 'FunctionExpression':{
          const nested=register(e,fn);analyze(e.body.body,nested,e.body,scopes);break;
        }
        case 'ClassExpression':analyzeClass(e);break;
        case 'Identifier':resolve(e);break;
        case 'Unary':if(strict&&e.operator==='delete'&&e.argument.kind==='Identifier')fail(e,'Strict delete of identifier');if((e.operator==='typeof'||e.operator==='delete')&&e.argument.kind==='Identifier')resolve(e.argument,'typeof');else expression(e.argument);break;
        case 'Update':if(e.argument.kind==='Identifier')resolve(e.argument,'write');else expression(e.argument);break;
        case 'Assignment':if(e.left.kind==='Identifier')resolve(e.left,'write');else if(e.left.kind==='ArrayPattern'||e.left.kind==='ObjectPattern'){for(const id of boundNames(e.left))resolve(id,'write');patternInitializers(e.left);}else expression(e.left);expression(e.right);break;
        case 'Member':expression(e.object);expression(e.property);break;
        case 'OptionalChain':expression(e.base);for(const link of e.links)if(link.kind==='property')expression(link.property);else link.arguments.forEach(arg=>expression(arg.kind==='SpreadElement'?arg.argument:arg));break;
        case 'ArrayLiteral':for(const item of e.elements)if(item)expression(item.kind==='SpreadElement'?item.argument:item);break;
        case 'Template':e.expressions.forEach(expression);break;
        case 'TaggedTemplate':expression(e.tag);e.expressions.forEach(expression);break;
        case 'Yield':if(!fn?.declaration.generator)fail(e,'yield outside generator');if(e.argument)expression(e.argument);break;
        case 'Await':if(!fn?.declaration.async)fail(e,'await outside async function');expression(e.argument);break;
        case 'ObjectLiteral':if(e.duplicateProto)fail(e,'Duplicate __proto__ property');for(const p of e.properties){if('spread'in p)expression(p.spread);else{if(p.coverInitialized)fail(e,'Shorthand default is only valid in an assignment pattern');expression(p.key);expression(p.value);}}break;
        case 'Binary':expression(e.left);expression(e.right);break;
        case 'Conditional':expression(e.test);expression(e.consequent);expression(e.alternate);break;
        case 'New':case 'Call':if(e.callee.kind==='Identifier')resolve(e.callee,'call');else if(e.callee.kind==='Super'&&e.kind==='Call'){
          let owner=fn;while(owner?.declaration.kind==='FunctionExpression'&&owner.declaration.arrow)owner=owner.parent;
          if(owner?.declaration.kind!=='FunctionExpression'||!owner.declaration.derivedConstructor)fail(e.callee,'super() requires a derived class constructor');
          if(owner!==fn){
            const func:A.Identifier={kind:'Identifier',name:'#superFunction',span:e.span},receiver:A.Identifier={kind:'Identifier',name:'#superReceiver',span:e.span};
            e.superRefs={func,receiver};resolve(func);resolve(receiver);
          }
        }else expression(e.callee);e.arguments.forEach(arg=>expression(arg.kind==='SpreadElement'?arg.argument:arg));break;
      }
    };
    const analyzeClass=(node:A.ClassExpression|A.ClassDeclaration):void=>{
      // The class scope has an immutable binding of the class name (ClassDefinitionEvaluation step 4),
      // separate from the outer binding a declaration creates.
      const namedExpression=node.id&&node.id.name!=='*default*'?node.id:null;
      if(namedExpression){
        // All parts of a class, including its name, are strict mode code.
        if(['eval','arguments','yield','let'].includes(namedExpression.name)||strictReserved.has(namedExpression.name))fail(namedExpression,'Restricted class name');
        const storage=fn?fn.locals:mainLocals;
        const binding:StorageBinding={kind:'local',name:namedExpression.name,index:storage.length,owner:fn?.index??-1,lexical:true,mutable:false};
        storage.push(binding);if(node.kind==='ClassExpression')bindings.set(namedExpression,binding);lexicalScopes.set(node,[binding]);
        scopes.push(new Map([[namedExpression.name,binding]]));
      }
      classCode++;if(node.superClass)expression(node.superClass);classCode--;
      for(const method of node.methods){if(method.computed){classCode++;expression(method.key);classCode--;}const nested=register(method.value,fn);analyze(method.value.body.body,nested,method.value.body,scopes);}
      const constructor=register(node.constructorMethod,fn);analyze(node.constructorMethod.body.body,constructor,node.constructorMethod.body,scopes);
      if(namedExpression)scopes.pop();
    };
    const patternInitializers=(pattern:A.BindingPattern):void=>{
      if(pattern.kind==='Identifier')return;
      if(pattern.kind==='Member'){expression(pattern);return;}
      if(pattern.kind==='ObjectPattern'){
        for(const property of pattern.properties){if(property.computed)expression(property.key);if(property.value.init)expression(property.value.init);patternInitializers(property.value.id);}
        if(pattern.rest)patternInitializers(pattern.rest);
        return;
      }
      for(const element of pattern.elements)if(element){
        if(element.init)expression(element.init);
        patternInitializers(element.id);
      }
      if(pattern.rest)patternInitializers(pattern.rest);
    };
    const statements=(list:A.Statement[],loops:number,switches=0):void=>{
      for(const s of list)switch(s.kind){
        case 'Function':{
          const nested=functionNodes.get(s)!;analyze(s.body.body,nested,s.body,scopes);break;
        }
        case 'Class':analyzeClass(s);break;
        case 'Throw':expression(s.argument);break;
        case 'Try':{
          statements([s.body],loops,switches);
          const scope=new Map<string,Binding>();
          if(s.parameter){
            const names=boundNames(s.parameter),declared=collectDeclarations(s.handler!.body,'lexical');
            for(const id of names){
              checkName(id);if(scope.has(id.name))fail(id,'Duplicate catch parameter');
              const storage=fn?fn.locals:mainLocals;const binding:StorageBinding={kind:'local',name:id.name,index:storage.length,owner:fn?.index??-1,lexical:true,mutable:true};storage.push(binding);bindings.set(id,binding);scope.set(binding.name,binding);
              // Annex B.3.5 allows `var e` only for a simple catch parameter.
              if(s.parameter.kind==='Identifier')catchBindings.add(binding);
              else for(const v of declared.vars)if(v.name===id.name)fail(v,'Catch parameter conflicts with var declaration');
              for(const declaration of declared.lexicals)
                if(declaration.name===binding.name)fail(declaration.id,'Catch parameter conflicts with lexical declaration');
            }
          }
          if(s.handler){scopes.push(scope);if(s.parameter&&s.parameter.kind!=='Identifier')patternInitializers(s.parameter);statements([s.handler],loops,switches);scopes.pop();}
          if(s.finalizer)statements([s.finalizer],loops,switches);break;
        }
        case 'Empty':case 'Debugger':case 'Import':break;
        case 'Export':{
          if(s.declaration)statements([s.declaration],loops,switches);
          else if(s.defaultExpression)expression(s.defaultExpression);
          else if(s.specifiers&&s.source===undefined)for(const specifier of s.specifiers){
            const local=functionNames.get(specifier.local);
            if(!local)fail(s,`Exported binding '${specifier.local}' is not declared`);
          }
          break;
        }
        case 'With':{
          if(strict)fail(s,'with is not allowed in strict mode code');
          expression(s.object);
          const storage=fn?fn.locals:mainLocals;
          const binding:StorageBinding={kind:'local',name:'#with',index:storage.length,owner:fn?.index??-1,lexical:true,mutable:true};
          storage.push(binding);bindings.set(s,binding);lexicalScopes.set(s,[binding]);
          scopes.push(new WithScope(binding));statements([s.body],loops,switches);scopes.pop();break;
        }
        case 'Var':for(const d of s.declarations){if(d.init){const id=d.id;if(s.declarationKind==='var'&&id.kind==='Identifier'){const visible=[...scopes].reverse().map(scope=>scope.get(id.name)).find(Boolean);if(visible&&catchBindings.has(visible)||scopes.some(scope=>scope instanceof WithScope))resolve(id,'write');}expression(d.init);}
          // var initializers inside with assign through the object environment.
          if(s.declarationKind==='var'&&scopes.some(scope=>scope instanceof WithScope))for(const id of boundNames(d.id))if(id!==d.id||!d.init)resolve(id,'write');
          patternInitializers(d.id);}break;
        case 'Block':if(s.annexBIf&&strict)fail(s,'Function declaration requires a StatementList');scoped(s,s.body,()=>statements(s.body,loops,switches));break;
        case 'ExpressionStatement':expression(s.expression);break;
        case 'If':expression(s.test);statements([s.consequent],loops,switches);if(s.alternate)statements([s.alternate],loops,switches);break;
        case 'While':case 'DoWhile':expression(s.test);statements([s.body],loops+1,switches);break;
        case 'For':scoped(s,[...(s.init?.kind==='Var'?[s.init]:[]),s.body],()=>{
          if(s.init){if(s.init.kind==='Var')statements([s.init],loops,switches);else expression(s.init);}
          if(s.test)expression(s.test);if(s.update)expression(s.update);statements([s.body],loops+1,switches);
        });break;
        case 'ForIn':case 'ForOf':{
          const left=s.left;
          if(left.kind==='Var'&&left.annexBInitializer){
            if(strict)fail(left,'for-in variable initializers are not allowed in strict mode');
            const id=left.declarations[0]!.id as A.Identifier;resolve(id,'write');expression(left.declarations[0]!.init!);
          }
          // The body's var names may not repeat the head's lexical names (ES2020 13.7.5.1).
          if(left.kind==='Var'&&left.declarationKind!=='var'){
            const lexical=new Set(boundNames(left.declarations[0]!.id).map(id=>id.name));
            for(const v of collectDeclarations([s.body],'var').vars)if(lexical.has(v.name))fail(v,'Loop body var conflicts with a lexical loop binding');
          }
          if(left.kind==='Var'&&left.declarationKind!=='var')scoped(s,[left],()=>{expression(s.right);patternInitializers(left.declarations[0]!.id);statements([s.body],loops+1,switches);});
          else{if(s.left.kind==='Identifier')resolve(s.left,'write');else if(s.left.kind==='Member')expression(s.left);else if(s.left.kind==='ArrayPattern'||s.left.kind==='ObjectPattern'){for(const id of boundNames(s.left))resolve(id,'write');patternInitializers(s.left);}else if(s.left.kind==='Var'){patternInitializers(s.left.declarations[0]!.id);const catchVisible=(id:A.Identifier)=>{const visible=[...scopes].reverse().map(scope=>scope instanceof WithScope?undefined:scope.get(id.name)).find(Boolean);return !!visible&&catchBindings.has(visible);};if(scopes.some(scope=>scope instanceof WithScope)||boundNames(s.left.declarations[0]!.id).some(catchVisible))boundNames(s.left.declarations[0]!.id).forEach(id=>resolve(id,'write'));}expression(s.right);statements([s.body],loops+1,switches);}
          break;
        }
        case 'Switch':
          expression(s.discriminant);
          scoped(s,s.cases.flatMap(c=>c.body),()=>{
            for(const c of s.cases){if(c.test)expression(c.test);statements(c.body,loops,switches+1);}
          });break;
        case 'Labeled': {
          if(labels.has(s.label.name))fail(s.label,'Duplicate label');
          if(strict&&(s.label.name==='yield'||s.label.name==='let'||strictReserved.has(s.label.name)))fail(s.label,'Restricted strict label');
          {let inner:A.Statement=s.body;while(inner.kind==='Labeled')inner=inner.body;if(inner.kind==='Function'&&(strict||inner.generator||inner.async))fail(inner,'Labelled function declarations are not allowed here');}
          let target=s.body;while(target.kind==='Labeled')target=target.body;
          labels.set(s.label.name,['While','DoWhile','For','ForIn','ForOf'].includes(target.kind));
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
    if(fn&&(fn.declaration.defaults?.some(Boolean)||fn.declaration.parameters.some(p=>p.kind!=='Identifier')||fn.declaration.rest?.kind!=='Identifier'&&fn.declaration.rest!==null&&fn.declaration.rest!==undefined)){
      // Initializers see parameter bindings and outer scopes, not var/function
      // declarations instantiated for the function body.
      const parameters=new Map<string,Binding>();
      for(const p of fn.locals)if(p.kind==='parameter'&&!p.name.startsWith('#'))parameters.set(p.name,p);
      const argumentsBinding=parameterArguments??functionNames.get('arguments');
      if(argumentsBinding&&argumentOwners.has(argumentsBinding as StorageBinding))parameters.set('arguments',argumentsBinding);
      const last=scopes.length-1,saved=scopes[last]!;scopes[last]=parameters;
      fn.declaration.parameters.forEach((pattern,index)=>{const init=fn.declaration.defaults?.[index];if(init)expression(init);patternInitializers(pattern);});
      if(fn.declaration.rest)patternInitializers(fn.declaration.rest);
      scopes[last]=saved;
    }
    statements(body,0);
  };
  if(!moduleRecords){
    analyze(ast.body,null,ast);
    return {ast,globals,mainLocals,functions,declarations,functionNodes,bindings,withChains,lexicalScopes,scopeFunctions,annexBFunctions};
  }
  // Module graph: an optional classic script prelude binds first, in the global scope.
  analyze(ast.body,null,ast);
  const scriptLexicals=lexicalScopes.get(ast)??[];
  // Every module environment binding is persistent storage.
  const hidden=(name:string,mutable=false):StorageBinding=>{const b:StorageBinding={kind:'global',name,index:globals.length,owner:-1,module:true,mutable};globals.push(b);return b;};
  type Placeholder={binding:StorageBinding;owner:number;from:number;imported:string|null;node:A.Node};
  const placeholders:Placeholder[]=[],moduleNames=moduleRecords.map(()=>new Map<string,Binding>());
  const modules:BoundModule[]=moduleRecords.map(record=>({record,namespace:hidden('#namespace'+record.index),meta:hidden('#meta'+record.index),exportNames:[],getters:[]}));
  const mainLexicals:StorageBinding[]=[...scriptLexicals];
  for(const record of moduleRecords){
    const names=moduleNames[record.index]!;
    for(const statement of record.ast.body){
      if(statement.kind==='Import')for(const specifier of statement.specifiers){
        if(names.has(specifier.local.name))fail(specifier.local,'Duplicate import binding');
        if(specifier.local.name==='eval'||specifier.local.name==='arguments')fail(specifier.local,'Restricted import binding');
        const binding:StorageBinding={kind:'global',name:specifier.local.name,index:-1,owner:-1,module:true,mutable:false,silentImmutable:false};
        names.set(binding.name,binding);importPlaceholders.add(binding);bindings.set(specifier.local,binding);
        placeholders.push({binding,owner:record.index,from:record.requests.get(statement.source)!,imported:specifier.kind==='namespace'?null:specifier.kind==='default'?'default':specifier.imported!,node:specifier.local});
      }
      if(statement.kind==='Export'&&statement.defaultExpression){
        const binding:StorageBinding={kind:'global',name:'*default*',index:globals.length,owner:-1,module:true,lexical:true,mutable:false};
        globals.push(binding);names.set('*default*',binding);bindings.set(statement.defaultId!,binding);mainLexicals.push(binding);
      }
    }
  }
  for(const record of moduleRecords){
    currentModule=record.index;
    analyze(record.ast.body,null,record.ast,[],moduleNames[record.index]);
    mainLexicals.push(...(lexicalScopes.get(record.ast)??[]));
  }
  currentModule=undefined;
  lexicalScopes.set(ast,mainLexicals);
  // Export resolution (ResolveExport / GetExportedNames, with star exports).
  type Resolution={binding:StorageBinding}|null|'ambiguous';
  const localExports=(index:number):Map<string,string>=>{
    const result=new Map<string,string>();
    for(const statement of moduleRecords[index]!.ast.body)if(statement.kind==='Export'&&statement.source===undefined){
      if(statement.defaultExpression)result.set('default','*default*');
      else if(statement.declaration){
        const declaration=statement.declaration;
        const ids=declaration.kind==='Var'?declaration.declarations.flatMap(d=>boundNames(d.id)):[declaration.id];
        const isDefault=statement.isDefault===true;
        for(const id of ids)result.set(isDefault?'default':id.name,id.name);
      }else for(const specifier of statement.specifiers??[])result.set(specifier.exported,specifier.local);
    }
    return result;
  };
  const indirectExports=(index:number):{exported:string;from:number;imported:string|null}[]=>moduleRecords[index]!.ast.body.flatMap((statement):{exported:string;from:number;imported:string|null}[]=>{
    if(statement.kind!=='Export'||statement.source===undefined)return [];
    const from=moduleRecords[index]!.requests.get(statement.source)!;
    if(statement.star)return statement.namespace===undefined?[]:[{exported:statement.namespace,from,imported:null}];
    return (statement.specifiers??[]).map(specifier=>({exported:specifier.exported,from,imported:specifier.local}));
  });
  const starExports=(index:number):number[]=>moduleRecords[index]!.ast.body.flatMap(statement=>statement.kind==='Export'&&statement.star&&statement.namespace===undefined?[moduleRecords[index]!.requests.get(statement.source!)!]:[]);
  const resolveExport=(index:number,name:string,resolveSet:Set<string>):Resolution=>{
    const key=index+'\u0000'+name;if(resolveSet.has(key))return null;resolveSet.add(key);
    const local=localExports(index).get(name);
    if(local!==undefined){
      const binding=moduleNames[index]!.get(local) as StorageBinding|undefined;
      if(!binding)return null;
      const placeholder=placeholders.find(p=>p.binding===binding);
      if(placeholder){
        if(placeholder.imported===null)return {binding:modules[placeholder.from]!.namespace};
        return resolveExport(placeholder.from,placeholder.imported,resolveSet);
      }
      return {binding};
    }
    for(const entry of indirectExports(index))if(entry.exported===name){
      if(entry.imported===null)return {binding:modules[entry.from]!.namespace};
      return resolveExport(entry.from,entry.imported,resolveSet);
    }
    if(name==='default')return null;
    let star:Resolution=null;
    for(const from of starExports(index)){
      const resolution=resolveExport(from,name,resolveSet);
      if(resolution==='ambiguous')return 'ambiguous';
      if(resolution===null)continue;
      if(star===null)star=resolution;
      else if(star.binding!==resolution.binding)return 'ambiguous';
    }
    return star;
  };
  const exportedNames=(index:number,visited:Set<number>):string[]=>{
    if(visited.has(index))return [];visited.add(index);
    const names=[...localExports(index).keys(),...indirectExports(index).map(entry=>entry.exported)];
    for(const from of starExports(index))for(const name of exportedNames(from,visited))if(name!=='default'&&!names.includes(name))names.push(name);
    return names;
  };
  // Modules reached from the entry through static imports must link at compile
  // time; a graph only reachable through import() reports its link error then.
  const statics=new Set<number>();
  const reach=(index:number):void=>{if(statics.has(index))return;statics.add(index);for(const next of moduleRecords[index]!.staticRequests)reach(next);};
  if(ast.module&&moduleRecords.length)reach(0);
  const linkFailure=(owner:number,node:A.Node,message:string):void=>{
    if(statics.has(owner))fail(node,message);
    modules[owner]!.linkError??=message;
  };
  for(const record of moduleRecords)if(record.loadError!==undefined)linkFailure(record.index,record.ast,record.loadError);
  for(const placeholder of placeholders){
    let target:StorageBinding;
    if(placeholder.imported===null)target=modules[placeholder.from]!.namespace;
    else{
      const resolution=resolveExport(placeholder.from,placeholder.imported,new Set());
      if(resolution===null||resolution==='ambiguous'){
        linkFailure(placeholder.owner,placeholder.node,`Module '${moduleRecords[placeholder.from]!.path}' does not provide an unambiguous export named '${placeholder.imported}'`);
        target=modules[placeholder.from]!.namespace;
      }else target=resolution.binding;
    }
    placeholder.binding.index=target.index;
    if(target.lexical)placeholder.binding.lexical=true;
  }
  for(const record of moduleRecords){
    const index=record.index;
    // Indirect exports must resolve even when nothing imports them.
    for(const entry of indirectExports(index))if(entry.imported!==null){
      const resolution=resolveExport(entry.from,entry.imported,new Set());
      if(resolution===null||resolution==='ambiguous')linkFailure(index,record.ast,`Module '${moduleRecords[entry.from]!.path}' does not provide an export named '${entry.imported}'`);
    }
    const names=exportedNames(index,new Set()).filter(name=>{const r=resolveExport(index,name,new Set());return r!==null&&r!=='ambiguous';});
    names.sort((a,b)=>a<b?-1:a>b?1:0);
    modules[index]!.exportNames=names;
    for(const name of names){
      const target=(resolveExport(index,name,new Set()) as {binding:StorageBinding}).binding;
      const id:A.Identifier={kind:'Identifier',name:'#export',span:record.ast.span};
      const node:A.FunctionExpression={kind:'FunctionExpression',arrow:true,id:null,parameters:[],defaults:[],rest:null,
        body:{kind:'Block',strict:true,body:[{kind:'Return',argument:id,span:record.ast.span}],span:record.ast.span},span:record.ast.span};
      const getter=register(node,null);getter.strict=true;
      analyze(node.body.body,getter,node.body,[new Map([['#export',target]])]);
      modules[index]!.getters.push(getter);
    }
  }
  return {ast,globals,mainLocals,functions,declarations,functionNodes,bindings,withChains,lexicalScopes,scopeFunctions,modules,annexBFunctions};
}
