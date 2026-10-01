import {boundNames} from '../frontend/declarations.js';
import type * as A from '../frontend/ast.js';
import type { Binding,StorageBinding,BoundProgram,BoundFunction } from '../frontend/bound.js';
import type { BlockIR,FunctionIR,ModuleIR,Operation,Terminator } from './model.js';
import {CompileError} from '../diagnostics.js';
type WithReference={found:number;object:number};
type Reference={id:A.Identifier;resolvable?:number;withRef?:WithReference}|{object:number;key:number;receiver?:number;/** super base already read into object */baseReady?:boolean};
type ChainState={kind:'value';slot:number;receiver?:number}|{kind:'reference';reference:Reference};
type Control={stop:number;next?:number;labels:string[];unlabelledBreak:boolean;handlerDepth:number;finalizerDepth:number;iterator?:number};
type Finalizer={body:A.Block;handlerDepth:number;controls:Control[]};

export function lower(bound:BoundProgram):ModuleIR {
  const templateCaches={next:bound.globals.length};
  const functions=[new Lowerer(bound,null,templateCaches,bound.modules?-1:undefined).run(bound.ast.body)];
  for(const module of bound.modules??[])functions.push(new Lowerer(bound,null,templateCaches,module.record.index).run(module.record.ast.body));
  for(const f of bound.functions){
    functions.push(new Lowerer(bound,f,templateCaches).run(f.declaration.body.body));
  }
  return {
    globalCount:templateCaches.next,
    functions,
    globalProperties:bound.globals.filter(b=>!b.lexical&&!b.module).map(({name,index})=>({name,index})),
    globalFunctionProperties:bound.declarations.flatMap(fn=>{
      const binding=bound.bindings.get(fn.declaration.id!);
      return binding?.kind==='globalProperty'?[binding.name]:[];
    }),
  };
}
class Lowerer {
  private blocks:BlockIR[]=[];
  private handlers:number[]=[];
  private handlerCount=0;
  private current:BlockIR;
  private terminated=false;
  private slots:number;
  private maxArguments=0;
  private captureSlots=new Map<StorageBinding,number>();
  private controls:Control[]=[];
  private finalizers:Finalizer[]=[];
  private asyncIterators=new Set<number>();
  /** Done flags of destructuring iterators; a return completion closes them only while not done. */
  private iteratorDoneFlags=new Map<number,number>();
  private tailCalls=new Set<A.Expression>();
  constructor(private bound:BoundProgram,private fn:BoundFunction|null,private templateCaches:{next:number},private moduleIndex?:number) {
    this.slots=fn?.locals.length??bound.mainLocals.length;this.current=this.block();
  }
  private get strict():boolean{return this.fn?.strict??(this.moduleIndex!==undefined&&this.moduleIndex>=0||!!this.bound.ast.strict);}
  private slot():number{return this.slots++;}
  private block():BlockIR {const b:BlockIR={id:this.blocks.length,...(this.handlers.length?{exceptionTarget:this.handlers[this.handlers.length-1]}:{}),operations:[],terminator:{kind:'return',value:-1}};this.blocks.push(b);return b;}
  private select(b:BlockIR):void {this.current=b;this.terminated=false;}
  private emit(op:Operation):void{this.current.operations.push(op);}
  private end(t:Terminator):void{this.current.terminator=t;this.terminated=true;}
  private constant(value:undefined|null|boolean|number|bigint|string):number {const dest=this.slot();this.emit({kind:'constant',dest,value});return dest;}
  private binding(id:A.Identifier):Binding {const b=this.bound.bindings.get(id);if(!b)throw new Error(`Missing binding: ${id.name}`);return b;}
  private cellSlot(binding:StorageBinding):number {
    if(binding.owner===(this.fn?.index??-1))return binding.index;
    const slot=this.captureSlots.get(binding);if(slot===undefined)throw new Error(`Missing capture ${binding.name}`);return slot;
  }
  private closure(fn:BoundFunction,inferredName?:string|number,homeObject?:number):number {
    const dest=this.slot(),captures=fn.captures.map(binding=>this.cellSlot(binding));
    const declared=fn.declaration.id?.name;
    const override=fn.declaration.kind==='FunctionExpression'?fn.declaration:undefined;
    const name=override?.nameOverride??(declared==='*default*'?'default':declared??inferredName??'');
    const sourceText=fn.module!==undefined?this.bound.modules![fn.module]!.record.ast.source:this.bound.ast.source;
    const sourceSpan=fn.declaration.kind==='FunctionExpression'?(fn.declaration.sourceSpan??fn.declaration.span):fn.declaration.span;
    this.emit({kind:'newFunction',strict:fn.strict,dest,...(homeObject===undefined?{}:{homeObject}),method:fn.declaration.kind==='FunctionExpression'&&fn.declaration.method===true,classConstructor:fn.declaration.kind==='FunctionExpression'&&fn.declaration.classConstructor===true,arrow:fn.declaration.kind==='FunctionExpression'&&fn.declaration.arrow===true,generator:fn.declaration.generator===true,...(fn.declaration.async?{async:true}:{}),target:`js.fn.${fn.index}`,captures,parameterCount:(fn.declaration.defaults?.findIndex(init=>init!==null)??-1)<0?fn.parameters.length:fn.declaration.defaults!.findIndex(init=>init!==null),
      sourceText:override?.sourceText??(fn.declaration.kind==='Function'?fn.declaration.sourceText:undefined)??sourceText?.slice(sourceSpan.start,sourceSpan.end),
      ...(typeof name==='number'?{nameSlot:name}:{name})});return dest;
  }
  private globalObject():number {const dest=this.slot();this.emit({kind:'globalObject',dest});return dest;}
  private currentThis():number {const dest=this.slot();this.emit({kind:'currentThis',dest});return dest;}
  private methodName(key:number,prefix?:string):number {
    const result=this.slot(),type=this.slot(),symbolType=this.constant('symbol'),isSymbol=this.slot(),symbol=this.block(),plain=this.block(),join=this.block();
    this.emit({kind:'unary',dest:type,operator:'typeof',argument:key});this.emit({kind:'binary',dest:isSymbol,operator:'===',left:type,right:symbolType});
    this.end({kind:'branch',condition:isSymbol,yes:symbol.id,no:plain.id});
    this.select(plain);this.emit({kind:'copy',dest:result,source:key});this.end({kind:'jump',target:join.id});
    this.select(symbol);const descriptionKey=this.constant('description'),description=this.slot(),undefinedValue=this.constant(undefined),missing=this.slot();
    this.emit({kind:'property',operation:'get',dest:description,object:key,key:descriptionKey});
    this.emit({kind:'binary',dest:missing,operator:'===',left:description,right:undefinedValue});
    const empty=this.block(),named=this.block();this.end({kind:'branch',condition:missing,yes:empty.id,no:named.id});
    this.select(empty);this.emit({kind:'copy',dest:result,source:this.constant('')});this.end({kind:'jump',target:join.id});
    this.select(named);const open=this.constant('['),left=this.slot(),close=this.constant(']'),full=this.slot();
    this.emit({kind:'binary',dest:left,operator:'+',left:open,right:description});this.emit({kind:'binary',dest:full,operator:'+',left,right:close});this.emit({kind:'copy',dest:result,source:full});this.end({kind:'jump',target:join.id});
    this.select(join);if(!prefix)return result;
    const prefixed=this.slot();this.emit({kind:'binary',dest:prefixed,operator:'+',left:this.constant(prefix),right:result});return prefixed;
  }
  private classValue(node:A.ClassExpression|A.ClassDeclaration,inferredName?:string|number):number {
    const classScope=this.bound.lexicalScopes.get(node);if(classScope)this.enterScope(node);
    const base=node.superClass?this.expression(node.superClass):null;
    const prototypeKey=this.constant('prototype');let basePrototype:number|null=null;const isNull=this.slot();
    if(base!==null){
      this.emit({kind:'validateClassHeritage',base});
      basePrototype=this.slot();const nullValue=this.constant(null),nullBranch=this.block(),objectBranch=this.block(),join=this.block();
      this.emit({kind:'binary',dest:isNull,operator:'===',left:base,right:nullValue});
      this.end({kind:'branch',condition:isNull,yes:nullBranch.id,no:objectBranch.id});
      this.select(nullBranch);this.emit({kind:'copy',dest:basePrototype,source:nullValue});this.end({kind:'jump',target:join.id});
      this.select(objectBranch);this.emit({kind:'property',operation:'get',dest:basePrototype,object:base,key:prototypeKey});this.end({kind:'jump',target:join.id});
      this.select(join);this.emit({kind:'validateClassPrototype',prototype:basePrototype});
    }
    const constructor=this.closure(this.bound.functionNodes.get(node.constructorMethod)!,node.id?.name==='*default*'?'default':node.id?.name??inferredName??'');
    if(classScope)this.store(classScope[0]!,constructor);
    const prototype=this.slot();this.emit({kind:'property',operation:'get',dest:prototype,object:constructor,key:prototypeKey});
    if(base!==null){
      // extends null keeps %Function.prototype% as the constructor's parent.
      const objectParent=this.block(),join=this.block();
      this.end({kind:'branch',condition:isNull,yes:join.id,no:objectParent.id});
      this.select(objectParent);this.emit({kind:'setPrototype',object:constructor,prototype:base});this.end({kind:'jump',target:join.id});
      this.select(join);this.emit({kind:'setPrototype',object:prototype,prototype:basePrototype!});
    }
    this.emit({kind:'setFunctionHomeObject',func:constructor,homeObject:prototype});
    this.emit({kind:'defineDataProperty',object:constructor,key:prototypeKey,source:prototype,attributes:0});
    for(const method of node.methods){
      const rawKey=this.expression(method.key),target=method.isStatic?constructor:prototype;
      let key=this.slot();
      this.emit({kind:'unary',dest:key,operator:'propertyKey',argument:rawKey});
      if(method.isStatic&&method.computed)key=this.preludeCall('staticMethodKey',[key]);
      const value=this.closure(this.bound.functionNodes.get(method.value)!,this.methodName(key,method.accessor?method.accessor+' ':undefined),target);
      if(method.accessor)this.emit({kind:'defineAccessor',object:target,key,source:value,setter:method.accessor==='set',nonEnumerable:true});
      else this.emit({kind:'defineDataProperty',object:target,key,source:value,attributes:5});
    }
    return constructor;
  }
  private lowerArguments(args:A.Argument[]):{fixed:number[]}|{array:number}{
    if(!args.some(arg=>arg.kind==='SpreadElement'))return {fixed:args.map(arg=>this.expression(arg as A.Expression))};
    return {array:this.expression({kind:'ArrayLiteral',elements:args,span:{start:0,end:0}})};
  }
  /** Calls in tail position of a return (ES2020 14.9 IsInTailPosition), strict code only. */
  private collectTailCalls(e:A.Expression):void {
    if(e.kind==='Call'&&e.callee.kind!=='Super'&&!e.arguments.some(arg=>arg.kind==='SpreadElement')||e.kind==='TaggedTemplate'&&e.tag.kind!=='OptionalChain')this.tailCalls.add(e);
    else if(e.kind==='Conditional'){this.collectTailCalls(e.consequent);this.collectTailCalls(e.alternate);}
    else if(e.kind==='Binary'&&[',','&&','||','??'].includes(e.operator))this.collectTailCalls(e.right);
  }
  private tailPosition():boolean {
    const d=this.fn?.declaration;
    return !!this.fn&&this.fn.strict&&!!d&&!d.generator&&!d.async&&!(d.kind==='FunctionExpression'&&(d.classConstructor||d.derivedConstructor))
      &&this.handlers.length===0&&this.finalizers.length===0&&!this.controls.some(c=>c.iterator!==undefined);
  }
  private invokeWithArguments(dest:number,callee:number,args:{fixed:number[]}|{array:number},receiver?:number,construct=false,newTarget?:number,tail=false):void {
    if('array'in args)this.emit({kind:'invokeArray',dest,callee,array:args.array,...(receiver===undefined?{}:{receiver}),construct,...(newTarget===undefined?{}:{newTarget})});
    else{this.maxArguments=Math.max(this.maxArguments,args.fixed.length);this.emit({kind:'invoke',dest,callee,arguments:args.fixed,...(receiver===undefined?{}:{receiver}),construct,...(newTarget===undefined?{}:{newTarget}),...(tail?{tail:true}:{})});}
  }
  private arrayOf(values:number[]):number {
    const array=this.slot();this.emit({kind:'newObject',dest:array,array:true,length:values.length});
    values.forEach((value,index)=>this.emit({kind:'setProperty',strict:true,object:array,key:this.constant(String(index)),source:value,define:true}));
    return array;
  }
  /** Module program entry: namespaces, import.meta, registration, then evaluation. */
  private moduleMain():void {
    const modules=this.bound.modules!;
    for(const module of modules){
      this.store(module.meta,this.preludeCall('createImportMeta',[]));
      const names=this.arrayOf(module.exportNames.map(name=>this.constant(name)));
      const getters=this.arrayOf(module.getters.map(getter=>this.closure(getter,'')));
      this.store(module.namespace,this.preludeCall('createNamespace',[names,getters]));
    }
    for(const module of modules){
      const body=this.slot();
      this.emit({kind:'newFunction',strict:true,dest:body,target:`js.module.${module.record.index}`,captures:[],parameterCount:0,name:''});
      const requests=this.arrayOf(module.record.staticRequests.map(index=>this.constant(index)));
      const specifiers=this.arrayOf([...module.record.requests.keys()].map(key=>this.constant(key)));
      const targets=this.arrayOf([...module.record.requests.values()].map(index=>this.constant(index)));
      this.preludeCall('registerModule',[this.constant(module.record.index),this.constant(module.record.path),body,requests,this.readStorage(module.namespace),specifiers,targets,module.linkError===undefined?this.constant(undefined):this.constant(module.linkError)]);
    }
    const script=this.bound.ast;
    if(!script.module){
      const specifiers=this.arrayOf((script.scriptRequests??[]).map(([specifier])=>this.constant(specifier)));
      const targets=this.arrayOf((script.scriptRequests??[]).map(([,index])=>this.constant(index)));
      this.preludeCall('registerScript',[this.constant(script.scriptPath??''),specifiers,targets]);
    }
  }
  /** Read a hidden storage binding (a with statement's object). */
  private readStorage(b:StorageBinding):number {
    const dest=this.slot();
    if(b.kind==='global'){this.emit({kind:'loadGlobal',dest,index:b.index});return dest;}
    if(b.captured)this.emit({kind:'readCell',dest,cell:this.cellSlot(b)});else this.emit({kind:'copy',dest,source:b.index});
    return dest;
  }
  private preludeCall(name:string,args:number[]):number {
    const dest=this.slot();this.maxArguments=Math.max(this.maxArguments,args.length);
    this.emit({kind:'call',dest,target:'rt.prelude.'+name,arguments:args});return dest;
  }
  /** HasBinding through enclosing with object environments, innermost first. */
  private withResolution(id:A.Identifier):WithReference|undefined {
    const chain=this.bound.withChains.get(id);if(!chain)return undefined;
    const found=this.slot(),object=this.slot(),join=this.block(),name=this.constant(id.name);
    for(const binding of chain){
      const candidate=this.readStorage(binding),has=this.preludeCall('withHasBinding',[candidate,name]);
      this.emit({kind:'copy',dest:found,source:has});this.emit({kind:'copy',dest:object,source:candidate});
      const next=this.block();this.end({kind:'branch',condition:has,yes:join.id,no:next.id});this.select(next);
    }
    this.end({kind:'jump',target:join.id});this.select(join);
    return {found,object};
  }
  /** Branch on a with resolution: object environment or the static binding. */
  private withBranch(ref:WithReference,dynamic:()=>number|void,fallback:()=>number|void):number {
    const dest=this.slot(),yes=this.block(),no=this.block(),join=this.block();
    this.end({kind:'branch',condition:ref.found,yes:yes.id,no:no.id});
    this.select(yes);const a=dynamic();if(a!==undefined)this.emit({kind:'copy',dest,source:a});this.end({kind:'jump',target:join.id});
    this.select(no);const b=fallback();if(b!==undefined)this.emit({kind:'copy',dest,source:b});this.end({kind:'jump',target:join.id});
    this.select(join);return dest;
  }
  private withGet(ref:WithReference,id:A.Identifier):number {
    return this.preludeCall('withGetBindingValue',[ref.object,this.constant(id.name),this.constant(this.strict)]);
  }
  private withSet(ref:WithReference,id:A.Identifier,source:number):void {
    this.preludeCall('withSetMutableBinding',[ref.object,this.constant(id.name),source,this.constant(this.strict)]);
  }
  private read(id:A.Identifier,allowMissing=false,withRef:WithReference|undefined=this.withResolution(id)):number {
    if(withRef)return this.withBranch(withRef,()=>this.withGet(withRef,id),()=>this.readStatic(id,allowMissing));
    return this.readStatic(id,allowMissing);
  }
  private readStatic(id:A.Identifier,allowMissing=false):number {
    const b=this.binding(id),dest=this.slot();
    switch(b.kind){
      case 'parameter':case 'local':
        if(b.captured)this.emit({kind:'readCell',dest,cell:this.cellSlot(b)});
        else this.emit({kind:'copy',dest,source:b.index});break;
      case 'global':this.emit({kind:'loadGlobal',dest,index:b.index});break;
      case 'globalProperty':this.emit({kind:'readGlobalProperty',dest,name:b.name,allowMissing});break;
      default:throw new Error('Unsupported binding');
    }
    if('lexical'in b&&b.lexical||b.kind==='parameter'&&(this.fn?.declaration.defaults?.some(Boolean)||this.fn?.declaration.parameters.some(p=>p.kind!=='Identifier')))this.emit({kind:'checkInitialized',slot:dest});
    return dest;
  }
  private write(id:A.Identifier,source:number,initializing=false,withRef:WithReference|undefined=initializing?undefined:this.withResolution(id)):void {
    if(withRef){this.withBranch(withRef,()=>this.withSet(withRef,id,source),()=>this.writeStatic(id,source,initializing));return;}
    this.writeStatic(id,source,initializing);
  }
  private writeStatic(id:A.Identifier,source:number,initializing=false):void {
    const b=this.binding(id);
    if(!initializing&&'silentImmutable'in b){if(b.silentImmutable)return;if(b.mutable===false){this.emit({kind:'immutableWrite'});return;}}
    if(!initializing&&'lexical'in b&&b.lexical){
      this.read(id);
      if(!b.mutable)this.emit({kind:'immutableWrite'});
    }
    this.store(b,source);
  }
  private store(b:Binding,source:number):void {
    if(b.kind==='global')this.emit({kind:'storeGlobal',strict:this.strict,source,index:b.index});
    else if(b.kind==='globalProperty')this.emit({kind:'setProperty',strict:this.strict,object:this.globalObject(),key:this.constant(b.name),source,define:false});
    else if(b.kind==='local'||b.kind==='parameter'){
      if(b.captured)this.emit({kind:'writeCell',cell:this.cellSlot(b),source});
      else this.emit({kind:'copy',dest:b.index,source});
    }
    else throw new Error('Invalid assignment binding');
  }
  private enterScope(owner:A.Node):void {
    for(const b of this.bound.lexicalScopes.get(owner)??[]){
      const dest=this.slot();this.emit({kind:'uninitialized',dest});
      if(b.kind==='local'&&b.captured)this.emit({kind:'newCell',dest:b.index,source:dest});
      else this.store(b,dest);
    }
    for(const fn of this.bound.scopeFunctions.get(owner)??[])
      this.store(this.binding(fn.declaration.id!),this.closure(fn));
  }
  private cloneIteration(owner:A.For):void {
    for(const b of this.bound.lexicalScopes.get(owner)??[])if(b.kind==='local'&&b.captured&&b.mutable){
      const value=this.slot();this.emit({kind:'readCell',dest:value,cell:b.index});
      this.emit({kind:'newCell',dest:b.index,source:value});
    }
  }
  private reference(e:A.Assignable,preserveGlobalResolution=false):Reference {
    if(e.kind==='Identifier'){
      const binding=this.binding(e);
      const withRef=this.withResolution(e);
      const resolvable=preserveGlobalResolution&&this.strict&&binding.kind==='globalProperty'
        ?this.globalExists(binding.name):undefined;
      return {id:e,...(resolvable===undefined?{}:{resolvable}),...(withRef?{withRef}:{})};
    }
    if(e.object.kind==='Super'){
      const receiver=this.slot();this.emit({kind:'currentThis',dest:receiver});
      const key=this.expression(e.property),object=this.slot();return {object,key,receiver};
    }
    // Keep the raw key: RHS effects may mutate an object used as a key.
    const object=this.expression(e.object),key=this.expression(e.property);
    return {object,key};
  }
  /** Read-modify-write references convert the key once (ToPropertyKey before GetValue). */
  private settledReference(ref:Reference):Reference {
    if('id'in ref)return ref;
    // Super references read their base (GetSuperBase) before the key is converted.
    if(ref.receiver!==undefined){
      this.emit({kind:'superBase',dest:ref.object});
      const key=this.slot();this.emit({kind:'unary',dest:key,operator:'propertyKey',argument:ref.key});
      return {...ref,key,baseReady:true};
    }
    // GetValue: ToObject(base) (TypeError for null/undefined) precedes ToPropertyKey.
    const nullish=this.slot(),fail=this.block(),ok=this.block();
    this.emit({kind:'unary',dest:nullish,operator:'isNullish',argument:ref.object});
    this.end({kind:'branch',condition:nullish,yes:fail.id,no:ok.id});
    this.select(fail);this.emit({kind:'immutableWrite'});this.end({kind:'jump',target:ok.id});this.select(ok);
    // Numbers stay Numbers: their ToPropertyKey has no side effects, so the
    // property operations convert them later (typed arrays use them directly).
    const key=this.slot();this.emit({kind:'unary',dest:key,operator:'propertyKeyIndex',argument:ref.key});
    return {...ref,key};
  }
  private globalExists(name:string):number {
    const object=this.globalObject(),key=this.constant(name),dest=this.slot();
    this.emit({kind:'property',operation:'has',dest,object,key});return dest;
  }
  private getReference(ref:Reference):number {
    if('id'in ref)return this.read(ref.id,false,ref.withRef);
    const dest=this.slot();if(ref.receiver!==undefined){if(!ref.baseReady)this.emit({kind:'superBase',dest:ref.object});const key=this.slot();this.emit({kind:'unary',dest:key,operator:'propertyKey',argument:ref.key});this.emit({kind:'superGet',dest,object:ref.object,key,receiver:ref.receiver});}else this.emit({kind:'property',operation:'get',dest,...ref});return dest;
  }
  private putReference(ref:Reference,source:number):void {
    if('id'in ref&&ref.withRef){
      const withRef=ref.withRef,id=ref.id;
      this.withBranch(withRef,()=>this.withSet(withRef,id,source),()=>this.putReference({id,...(ref.resolvable===undefined?{}:{resolvable:ref.resolvable})},source));
    }
    else if('id'in ref){
      const binding=this.binding(ref.id);
      if(this.strict&&binding.kind==='globalProperty'){
        if(ref.resolvable!==undefined)this.emit({kind:'checkResolvable',slot:ref.resolvable});
        this.emit({kind:'checkResolvable',slot:this.globalExists(binding.name)});
      }
      // The reference was already resolved (with objects included) by reference().
      this.writeStatic(ref.id,source);
    }
    else if(ref.receiver!==undefined){if(!ref.baseReady)this.emit({kind:'superBase',dest:ref.object});const key=this.slot();this.emit({kind:'unary',dest:key,operator:'propertyKey',argument:ref.key});this.emit({kind:'superSet',strict:this.strict,object:ref.object,key,receiver:ref.receiver,source});}
    else this.emit({kind:'setProperty',strict:this.strict,object:ref.object,key:ref.key,source,define:false});
  }
  private bindPattern(pattern:A.BindingPattern,value:number,initializing:boolean,assignment=false):void {
    if(pattern.kind==='Identifier'){
      if(!initializing&&this.strict){const binding=this.binding(pattern);if(binding.kind==='globalProperty')this.emit({kind:'checkResolvable',slot:this.globalExists(binding.name)});}
      this.write(pattern,value,initializing);return;
    }
    if(pattern.kind==='Member'){this.putReference(this.reference(pattern),value);return;}
    if(pattern.kind==='ObjectPattern'){
      const nullValue=this.constant(null),isNullish=this.slot(),error=this.block(),ready=this.block();
      this.emit({kind:'binary',dest:isNullish,operator:'==',left:value,right:nullValue});
      this.end({kind:'branch',condition:isNullish,yes:error.id,no:ready.id});
      this.select(error);this.emit({kind:'immutableWrite'});this.end({kind:'jump',target:ready.id});this.select(ready);
      const excluded:number[]=[];
      for(const property of pattern.properties){
        const rawKey=this.expression(property.key),key=this.slot(),item=this.slot();
        this.emit({kind:'unary',dest:key,operator:'propertyKey',argument:rawKey});
        excluded.push(key);
        // The target reference is resolved before the property is read (KeyedDestructuringAssignmentEvaluation step 1).
        const target=property.value.id;
        const earlyWith=target.kind==='Identifier'&&!initializing?this.withResolution(target):undefined;
        const earlyReference=assignment&&target.kind==='Member'?this.reference(target):null;
        this.emit({kind:'property',operation:'get',dest:item,object:value,key});
        const boundValue=this.slot();this.emit({kind:'copy',dest:boundValue,source:item});
        if(property.value.init){
          const undefinedValue=this.constant(undefined),isUndefined=this.slot(),fallback=this.block(),ready=this.block();
          this.emit({kind:'binary',dest:isUndefined,operator:'===',left:item,right:undefinedValue});
          this.end({kind:'branch',condition:isUndefined,yes:fallback.id,no:ready.id});
          this.select(fallback);this.emit({kind:'copy',dest:boundValue,source:this.expression(property.value.init,property.value.id.kind==='Identifier'?property.value.id.name:undefined)});this.end({kind:'jump',target:ready.id});
          this.select(ready);
        }
        if(earlyReference)this.putReference(earlyReference,boundValue);
        else if(earlyWith&&target.kind==='Identifier'){
          if(this.strict){const binding=this.binding(target);if(binding.kind==='globalProperty')this.emit({kind:'checkResolvable',slot:this.globalExists(binding.name)});}
          this.write(target,boundValue,false,earlyWith);
        }
        else this.bindPattern(target,boundValue,initializing,assignment);
      }
      if(pattern.rest){
        const rest=this.slot(),copied=this.slot();this.emit({kind:'newObject',dest:rest,array:false,length:0});
        this.maxArguments=Math.max(this.maxArguments,2+excluded.length);
        this.emit({kind:'call',dest:copied,target:'rt.copyDataPropertiesExcept',arguments:[rest,value,...excluded]});
        this.bindPattern(pattern.rest,copied,initializing,assignment);
      }
      return;
    }
    const iterator=this.slot(),next=this.slot(),doneFlag=this.slot(),falseValue=this.constant(false),trueValue=this.constant(true);
    this.emit({kind:'getIterator',iterator,next,object:value});this.emit({kind:'copy',dest:doneFlag,source:falseValue});
    const caught=this.block(),after=this.block(),error=this.slot(),handlerIndex=this.handlerCount++;
    this.emit({kind:'pushHandler',index:handlerIndex,target:caught.id,error,handlerKind:'finally'});this.handlers.push(caught.id);
    // A return completion inside the pattern (generator.return() at a yield) closes the iterator too.
    this.iteratorDoneFlags.set(iterator,doneFlag);
    this.controls.push({stop:after.id,labels:[],unlabelledBreak:false,handlerDepth:this.handlers.length,finalizerDepth:this.finalizers.length,iterator});
    for(const element of pattern.elements){
      const earlyReference=assignment&&element?.id.kind==='Member'?this.reference(element.id):null;
      const missing=this.block(),step=this.block(),join=this.block(),item=this.slot(),done=this.slot();
      this.end({kind:'branch',condition:doneFlag,yes:missing.id,no:step.id});
      this.select(missing);const undefinedValue=this.constant(undefined);this.emit({kind:'copy',dest:item,source:undefinedValue});this.emit({kind:'copy',dest:done,source:trueValue});this.end({kind:'jump',target:join.id});
      this.select(step);this.emit({kind:'copy',dest:doneFlag,source:trueValue});this.emit({kind:'iteratorStep',dest:item,done,iterator,next});this.end({kind:'jump',target:join.id});
      this.select(join);this.emit({kind:'copy',dest:doneFlag,source:done});
      if(element){
        const boundValue=this.slot();this.emit({kind:'copy',dest:boundValue,source:item});
        if(element.init){
          const undefinedValue=this.constant(undefined),isUndefined=this.slot(),fallback=this.block(),ready=this.block();
          this.emit({kind:'binary',dest:isUndefined,operator:'===',left:item,right:undefinedValue});
          this.end({kind:'branch',condition:isUndefined,yes:fallback.id,no:ready.id});
          this.select(fallback);this.emit({kind:'copy',dest:boundValue,source:this.expression(element.init,element.id.kind==='Identifier'?element.id.name:undefined)});this.end({kind:'jump',target:ready.id});
          this.select(ready);
        }
        if(earlyReference)this.putReference(earlyReference,boundValue);
        else this.bindPattern(element.id,boundValue,initializing,assignment);
      }
    }
    if(pattern.rest){
      const earlyReference=assignment&&pattern.rest.kind==='Member'?this.reference(pattern.rest):null;
      const array=this.slot(),index=this.slot(),zero=this.constant(0),one=this.constant(1);
      this.emit({kind:'newObject',dest:array,array:true,length:0});this.emit({kind:'copy',dest:index,source:zero});
      const condition=this.block(),step=this.block(),body=this.block(),join=this.block();this.end({kind:'jump',target:condition.id});this.select(condition);
      this.end({kind:'branch',condition:doneFlag,yes:join.id,no:step.id});this.select(step);
      const item=this.slot(),done=this.slot();this.emit({kind:'copy',dest:doneFlag,source:trueValue});this.emit({kind:'iteratorStep',dest:item,done,iterator,next});this.emit({kind:'copy',dest:doneFlag,source:done});this.end({kind:'branch',condition:done,yes:join.id,no:body.id});
      this.select(body);const key=this.slot();this.emit({kind:'unary',dest:key,operator:'propertyKey',argument:index});this.emit({kind:'setProperty',strict:true,object:array,key,source:item,define:true});
      const increment=this.slot();this.emit({kind:'binary',dest:increment,operator:'+',left:index,right:one});this.emit({kind:'copy',dest:index,source:increment});this.end({kind:'jump',target:condition.id});
      this.select(join);if(earlyReference)this.putReference(earlyReference,array);else this.bindPattern(pattern.rest,array,initializing,assignment);
    }
    this.controls.pop();
    this.emit({kind:'popHandler'});this.handlers.pop();
    if(!pattern.rest){
      const close=this.block(),join=this.block();this.end({kind:'branch',condition:doneFlag,yes:join.id,no:close.id});
      this.select(close);this.emit({kind:'iteratorClose',iterator});this.end({kind:'jump',target:join.id});this.select(join);
    }
    this.end({kind:'jump',target:after.id});
    const rethrow=this.block(),close=this.block();this.select(caught);
    this.returnMarkerBranch(error,()=>{
      const returnClose=this.block(),closed=this.block();this.end({kind:'branch',condition:doneFlag,yes:closed.id,no:returnClose.id});
      this.select(returnClose);this.emit({kind:'iteratorClose',iterator});this.end({kind:'jump',target:closed.id});this.select(closed);
    });
    this.end({kind:'branch',condition:doneFlag,yes:rethrow.id,no:close.id});this.select(close);
    const closeFailed=this.block(),closeError=this.slot(),closeIndex=this.handlerCount++;
    this.emit({kind:'pushHandler',index:closeIndex,target:closeFailed.id,error:closeError});this.handlers.push(closeFailed.id);
    this.emit({kind:'iteratorClose',iterator});this.emit({kind:'popHandler'});this.end({kind:'jump',target:rethrow.id});this.handlers.pop();
    this.select(closeFailed);this.end({kind:'jump',target:rethrow.id});
    this.select(rethrow);this.end({kind:'throw',value:error});this.select(after);
  }
  /**
   * In an iterator-closing handler: generator.return() unwinds with a marker
   * (a return completion), which closes the iterator with its errors
   * propagating, then continues unwinding.
   */
  private returnMarkerBranch(error:number,onReturn:()=>void):void {
    const isMarker=this.slot(),returning=this.block(),other=this.block();
    this.emit({kind:'unary',dest:isMarker,operator:'isReturnMarker',argument:error});
    this.end({kind:'branch',condition:isMarker,yes:returning.id,no:other.id});
    this.select(returning);onReturn();if(!this.terminated)this.end({kind:'throw',value:error});
    this.select(other);
  }
  private assignLoopTarget(left:A.Var|A.Assignable|A.ArrayPattern|A.ObjectPattern,value:number):void {
    if(left.kind==='Var')this.bindPattern(left.declarations[0]!.id,value,left.declarationKind!=='var');
    else if(left.kind==='ArrayPattern'||left.kind==='ObjectPattern')this.bindPattern(left,value,false,true);
    else if(left.kind==='Identifier')this.write(left,value);
    else if((left as A.Node).kind==='Call')this.callTargetError(left as unknown as A.Call);
    else this.putReference(this.reference(left),value);
  }
  /** Annex B.3.8: a call expression target is evaluated, then ReferenceError. */
  private callTargetError(call:A.Call):number {
    this.expression(call);this.emit({kind:'immutableWrite',error:'ReferenceError'});return this.constant(undefined);
  }
  private lowerOptionalChain(e:A.OptionalChain,mode:'value'|'delete',preserveReceiver=false):{value:number;receiver?:number} {
    const result=this.slot(),receiverResult=preserveReceiver?this.slot():undefined,join=this.block();
    if(receiverResult!==undefined){const missing=this.constant(undefined);this.emit({kind:'copy',dest:receiverResult,source:missing});}
    let state:ChainState;
    if(e.base.kind==='Member')state={kind:'reference',reference:this.reference(e.base)};
    else if(e.base.kind==='OptionalChain'){
      const nested=this.optionalChainCallee(e.base);state={kind:'value',slot:nested.callee,...(nested.receiver===undefined?{}:{receiver:nested.receiver})};
    }else state={kind:'value',slot:this.expression(e.base)};
    const materialize=():number=>{
      if(state.kind==='value')return state.slot;
      const slot=this.getReference(state.reference);state={kind:'value',slot};return slot;
    };
    const optionalCheck=(slot:number):void=>{
      const condition=this.slot();this.emit({kind:'unary',dest:condition,operator:'isNullish',argument:slot});
      const short=this.block(),next=this.block();this.end({kind:'branch',condition,yes:short.id,no:next.id});
      this.select(short);const skipped=this.constant(mode==='delete'?true:undefined);this.emit({kind:'copy',dest:result,source:skipped});this.end({kind:'jump',target:join.id});
      this.select(next);
    };
    for(const link of e.links){
      if(link.kind==='property'){
        const object=materialize();if(link.optional)optionalCheck(object);
        const key=this.expression(link.property);state={kind:'reference',reference:{object,key}};
      }else{
        let receiver:number|undefined;
        if(state.kind==='reference'&&'object'in state.reference)receiver=state.reference.receiver??state.reference.object;
        else if(state.kind==='value')receiver=state.receiver;
        const callee=materialize();if(link.optional)optionalCheck(callee);
        const args=this.lowerArguments(link.arguments),dest=this.slot();
        this.invokeWithArguments(dest,callee,args,receiver);state={kind:'value',slot:dest};
      }
    }
    if(mode==='delete'){
      let value:number;
      if(state.kind==='reference'&&'object'in state.reference){
        if(state.reference.receiver!==undefined){this.emit({kind:'immutableWrite',error:'ReferenceError'});value=this.constant(undefined);}
        else {value=this.slot();this.emit({kind:'property',operation:'delete',strict:this.strict,dest:value,object:state.reference.object,key:state.reference.key});}
      }else {if(state.kind==='reference')this.getReference(state.reference);value=this.constant(true);}
      this.emit({kind:'copy',dest:result,source:value});
    }else{
      if(preserveReceiver&&receiverResult!==undefined){
        const receiver=state.kind==='reference'&&'object'in state.reference
          ?state.reference.receiver??state.reference.object
          :state.kind==='value'?state.receiver:undefined;
        if(receiver!==undefined)this.emit({kind:'copy',dest:receiverResult,source:receiver});
      }
      const value=materialize();this.emit({kind:'copy',dest:result,source:value});
    }
    this.end({kind:'jump',target:join.id});this.select(join);
    return {value:result,...(receiverResult===undefined?{}:{receiver:receiverResult})};
  }
  private optionalChain(e:A.OptionalChain,mode:'value'|'delete'):number{return this.lowerOptionalChain(e,mode).value;}
  private optionalChainCallee(e:A.OptionalChain):{callee:number;receiver?:number}{const result=this.lowerOptionalChain(e,'value',true);return {callee:result.value,...(result.receiver===undefined?{}:{receiver:result.receiver})};}
  private expression(e:A.Expression,inferredName?:string|number):number {
    switch(e.kind){
      case 'NewTarget':{const dest=this.slot();this.emit({kind:'newTarget',dest});return dest;}
      case 'Super':throw new Error('Bare super');
      case 'This':{if(this.moduleIndex!==undefined&&this.moduleIndex>=0)return this.constant(undefined);const dest=this.slot();this.emit({kind:'currentThis',dest});return dest;}
      case 'ImportMeta':{
        const index=this.fn?.module??(this.moduleIndex!==undefined&&this.moduleIndex>=0?this.moduleIndex:undefined);if(index===undefined)throw new CompileError([{code:'E_SYNTAX',message:'import.meta is only valid in module code',file:'',span:e.span}]);
        return this.readStorage(this.bound.modules![index]!.meta);
      }
      case 'ImportCall':{
        const specifier=this.expression(e.argument),referrer=this.constant(this.fn?.module??(this.moduleIndex!==undefined&&this.moduleIndex>=0?this.moduleIndex:-1));
        return this.preludeCall('dynamicImport',[specifier,referrer]);
      }
      case 'Literal':return this.constant(e.value);
      case 'RegExpLiteral':{
        const dest=this.slot(),pattern=this.constant(e.pattern),flags=this.constant(e.flags);
        this.maxArguments=Math.max(this.maxArguments,2);
        this.emit({kind:'call',dest,target:'rt.RegExp.code',arguments:[pattern,flags]});
        return dest;
      }
      case 'Yield':{
        if(e.delegate&&this.fn?.declaration.async)return this.asyncYieldStar(e.argument!);
        if(e.delegate){
          const object=this.expression(e.argument!),iterator=this.slot(),next=this.slot(),result=this.slot(),sent=this.slot(),mode=this.slot(),returning=this.slot(),value=this.slot();
          const doneKey=this.constant('done'),valueKey=this.constant('value'),throwKey=this.constant('throw'),returnKey=this.constant('return');
          const falseValue=this.constant(false),trueValue=this.constant(true),one=this.constant(1),two=this.constant(2),undefinedValue=this.constant(undefined);
          this.emit({kind:'getIterator',iterator,next,object});this.maxArguments=Math.max(this.maxArguments,1);
          this.emit({kind:'copy',dest:returning,source:falseValue});
          this.emit({kind:'invoke',dest:result,callee:next,arguments:[undefinedValue],receiver:iterator});
          const inspect=this.block(),yielded=this.block(),dispatch=this.block(),again=this.block(),throwEntry=this.block(),returnEntry=this.block(),completion=this.block(),abruptReturn=this.block(),finish=this.block();
          this.end({kind:'jump',target:inspect.id});this.select(inspect);
          this.emit({kind:'requireObject',source:result});
          const done=this.slot();this.emit({kind:'property',operation:'get',dest:done,object:result,key:doneKey});
          this.end({kind:'branch',condition:done,yes:completion.id,no:yielded.id});
          this.select(yielded);this.emit({kind:'yieldDelegated',dest:sent,mode,source:result});this.end({kind:'jump',target:dispatch.id});
          this.select(dispatch);const isThrow=this.slot();this.emit({kind:'binary',dest:isThrow,operator:'===',left:mode,right:one});
          const checkReturn=this.block();this.end({kind:'branch',condition:isThrow,yes:throwEntry.id,no:checkReturn.id});
          this.select(checkReturn);const isReturn=this.slot();this.emit({kind:'binary',dest:isReturn,operator:'===',left:mode,right:two});
          this.end({kind:'branch',condition:isReturn,yes:returnEntry.id,no:again.id});
          this.select(again);this.emit({kind:'copy',dest:returning,source:falseValue});this.emit({kind:'invoke',dest:result,callee:next,arguments:[sent],receiver:iterator});this.end({kind:'jump',target:inspect.id});
          this.select(throwEntry);const throwMethod=this.slot(),throwMissing=this.slot(),noThrow=this.block(),invokeThrow=this.block();
          this.emit({kind:'property',operation:'get',dest:throwMethod,object:iterator,key:throwKey});
          this.emit({kind:'unary',dest:throwMissing,operator:'isNullish',argument:throwMethod});this.end({kind:'branch',condition:throwMissing,yes:noThrow.id,no:invokeThrow.id});
          this.select(noThrow);this.emit({kind:'iteratorClose',iterator});this.emit({kind:'immutableWrite'});
          this.end({kind:'throw',value:sent});
          this.select(invokeThrow);this.emit({kind:'copy',dest:returning,source:falseValue});this.emit({kind:'invoke',dest:result,callee:throwMethod,arguments:[sent],receiver:iterator});this.end({kind:'jump',target:inspect.id});
          this.select(returnEntry);const returnMethod=this.slot(),returnMissing=this.slot(),noReturn=this.block(),invokeReturn=this.block();
          this.emit({kind:'property',operation:'get',dest:returnMethod,object:iterator,key:returnKey});
          this.emit({kind:'unary',dest:returnMissing,operator:'isNullish',argument:returnMethod});this.end({kind:'branch',condition:returnMissing,yes:noReturn.id,no:invokeReturn.id});
          this.select(noReturn);this.complete({kind:'return',value:sent},0,0,[...this.controls].reverse().flatMap(c=>c.iterator===undefined?[]:[c.iterator]));
          this.select(invokeReturn);this.emit({kind:'copy',dest:returning,source:trueValue});this.emit({kind:'invoke',dest:result,callee:returnMethod,arguments:[sent],receiver:iterator});this.end({kind:'jump',target:inspect.id});
          this.select(completion);this.emit({kind:'property',operation:'get',dest:value,object:result,key:valueKey});
          this.end({kind:'branch',condition:returning,yes:abruptReturn.id,no:finish.id});
          this.select(abruptReturn);this.complete({kind:'return',value},0,0,[...this.controls].reverse().flatMap(c=>c.iterator===undefined?[]:[c.iterator]));
          this.select(finish);return value;
        }
        let source=e.argument===null?this.constant(undefined):this.expression(e.argument);const dest=this.slot();
        // AsyncGeneratorYield awaits the operand before yielding it.
        if(this.fn?.declaration.async){const awaited=this.slot();this.emit({kind:'await',dest:awaited,source});source=awaited;}
        this.emit({kind:'yield',dest,source});return dest;
      }
      case 'Await':{
        const source=this.expression(e.argument),dest=this.slot();
        this.emit({kind:'await',dest,source});return dest;
      }
      case 'TaggedTemplate':{
        const optional=e.tag.kind==='OptionalChain'?this.optionalChainCallee(e.tag):undefined;
        const ref=!optional&&e.tag.kind==='Member'?this.reference(e.tag):undefined;
        const receiver=optional?.receiver??(ref&&'object'in ref?(ref.receiver??ref.object):undefined);
        const callee=optional?.callee??(ref?this.getReference(ref):this.expression(e.tag));
        const cache=this.templateCaches.next++,cached=this.slot(),missing=this.slot(),undefinedValue=this.constant(undefined);
        this.emit({kind:'loadGlobal',dest:cached,index:cache});
        this.emit({kind:'binary',dest:missing,operator:'===',left:cached,right:undefinedValue});
        const create=this.block(),ready=this.block();this.end({kind:'branch',condition:missing,yes:create.id,no:ready.id});
        this.select(create);
        const cooked=this.slot(),raw=this.slot();
        this.emit({kind:'newObject',dest:cooked,array:true,length:e.quasis.length});
        this.emit({kind:'newObject',dest:raw,array:true,length:e.rawQuasis.length});
        for(let i=0;i<e.quasis.length;i++){
          const key=this.constant(String(i)),cookedValue=this.constant(e.quasis[i]),rawValue=this.constant(e.rawQuasis[i]!);
          this.emit({kind:'setProperty',object:cooked,key,source:cookedValue,define:true});
          this.emit({kind:'setProperty',object:raw,key,source:rawValue,define:true});
        }
        const frozenRaw=this.slot(),frozenCooked=this.slot();this.maxArguments=Math.max(this.maxArguments,1);
        this.emit({kind:'call',dest:frozenRaw,target:'rt.Object.freeze.fn.code',arguments:[raw]});
        this.emit({kind:'defineDataProperty',object:cooked,key:this.constant('raw'),source:raw,attributes:0});
        this.emit({kind:'call',dest:frozenCooked,target:'rt.Object.freeze.fn.code',arguments:[cooked]});
        this.emit({kind:'storeGlobal',index:cache,source:cooked});this.end({kind:'jump',target:ready.id});
        this.select(ready);const template=this.slot();this.emit({kind:'loadGlobal',dest:template,index:cache});
        const substitutions=e.expressions.map(expression=>this.expression(expression)),dest=this.slot();
        this.invokeWithArguments(dest,callee,{fixed:[template,...substitutions]},receiver,false,undefined,this.tailCalls.has(e));return dest;
      }
      case 'Template':{
        let result=this.constant(e.quasis[0]!);
        for(let i=0;i<e.expressions.length;i++){
          const value=this.expression(e.expressions[i]!),string=this.slot();
          this.emit({kind:'unary',dest:string,operator:'string',argument:value});
          const joined=this.slot();this.emit({kind:'binary',dest:joined,operator:'+',left:result,right:string});
          const suffix=this.constant(e.quasis[i+1]!),next=this.slot();
          this.emit({kind:'binary',dest:next,operator:'+',left:joined,right:suffix});result=next;
        }
        return result;
      }
      case 'Identifier':return this.read(e);
      case 'ClassExpression':return this.classValue(e,inferredName);
      case 'FunctionExpression':return this.closure(this.bound.functionNodes.get(e)!,inferredName);
      case 'Member':return this.getReference(this.reference(e));
      case 'OptionalChain':return this.optionalChain(e,'value');
      case 'ObjectLiteral':case 'ArrayLiteral': {
        const spread=e.kind==='ArrayLiteral'&&e.elements.some(item=>item?.kind==='SpreadElement');
        const dest=this.slot();this.emit({kind:'newObject',dest,array:e.kind==='ArrayLiteral',length:e.kind==='ArrayLiteral'&&!spread?e.elements.length:0});
        if(e.kind==='ArrayLiteral'&&!spread)e.elements.forEach((item,i)=>{
          if(item&&item.kind!=='SpreadElement'){const key=this.constant(String(i)),source=this.expression(item);this.emit({kind:'setProperty',strict:this.strict,object:dest,key,source,define:true});}
        });
        else if(e.kind==='ArrayLiteral'){
          const index=this.slot(),zero=this.constant(0),one=this.constant(1);this.emit({kind:'copy',dest:index,source:zero});
          const append=(source:number)=>{const key=this.slot();this.emit({kind:'unary',dest:key,operator:'propertyKey',argument:index});this.emit({kind:'setProperty',strict:this.strict,object:dest,key,source,define:true});const next=this.slot();this.emit({kind:'binary',dest:next,operator:'+',left:index,right:one});this.emit({kind:'copy',dest:index,source:next});};
          for(const item of e.elements){
            if(!item){const next=this.slot();this.emit({kind:'binary',dest:next,operator:'+',left:index,right:one});this.emit({kind:'copy',dest:index,source:next});continue;}
            if(item.kind!=='SpreadElement'){append(this.expression(item));continue;}
            const object=this.expression(item.argument),iterator=this.slot(),next=this.slot();this.emit({kind:'getIterator',iterator,next,object});
            const condition=this.block(),body=this.block(),join=this.block();this.end({kind:'jump',target:condition.id});this.select(condition);
            const value=this.slot(),done=this.slot();this.emit({kind:'iteratorStep',dest:value,done,iterator,next});this.end({kind:'branch',condition:done,yes:join.id,no:body.id});
            this.select(body);append(value);this.end({kind:'jump',target:condition.id});this.select(join);
          }
          const lengthKey=this.constant('length');this.emit({kind:'setProperty',strict:true,object:dest,key:lengthKey,source:index,define:false});
        }
        else for(const p of e.properties){
          if('spread'in p){const source=this.expression(p.spread),copied=this.slot();this.maxArguments=Math.max(this.maxArguments,2);this.emit({kind:'call',dest:copied,target:'rt.copyDataProperties',arguments:[dest,source]});continue;}
          const raw=this.expression(p.key),key=this.slot();this.emit({kind:'unary',dest:key,operator:'propertyKey',argument:raw});
          const functionName=p.value.kind==='FunctionExpression'||p.value.kind==='ClassExpression'?this.methodName(key,p.accessor?p.accessor+' ':undefined):key;
          const source=p.value.kind==='FunctionExpression'&&p.value.method?this.closure(this.bound.functionNodes.get(p.value)!,functionName,dest):this.expression(p.value,p.prototype?undefined:functionName);
          if(p.prototype)this.emit({kind:'setPrototype',object:dest,prototype:source});
          else if(p.accessor)this.emit({kind:'defineAccessor',object:dest,key,source,setter:p.accessor==='set'});
          else this.emit({kind:'setProperty',strict:this.strict,object:dest,key,source,define:true});
        }
        return dest;
      }
      case 'Unary': {
        if(e.operator==='delete'){
          if(e.argument.kind==='OptionalChain')return this.optionalChain(e.argument,'delete');
          if(e.argument.kind==='Identifier'){
            const withRef=this.withResolution(e.argument),id=e.argument;
            const staticDelete=():number=>{
              const binding=this.binding(id);
              if(binding.kind==='globalProperty'){
                const object=this.globalObject(),key=this.constant(binding.name),dest=this.slot();
                this.emit({kind:'property',operation:'delete',strict:this.strict,dest,object,key});return dest;
              }
              return this.constant(false);
            };
            if(withRef)return this.withBranch(withRef,()=>{const dest=this.slot();this.emit({kind:'property',operation:'delete',strict:false,dest,object:withRef.object,key:this.constant(id.name)});return dest;},staticDelete);
            return staticDelete();
          }
          if(e.argument.kind==='Member'){
            // SuperProperty evaluation reads this (GetThisEnvironment) before the key.
            if(e.argument.object.kind==='Super'){this.currentThis();this.expression(e.argument.property);this.emit({kind:'immutableWrite',error:'ReferenceError'});return this.constant(undefined);}
            const ref=this.reference(e.argument);if('id'in ref)throw new Error('Expected property');
            if(ref.receiver!==undefined){this.emit({kind:'immutableWrite',error:'ReferenceError'});return this.constant(undefined);}
            const dest=this.slot();this.emit({kind:'property',operation:'delete',strict:this.strict,dest,...ref});return dest;
          }
          this.expression(e.argument);return this.constant(true);
        }
        const argument=e.operator==='typeof'&&e.argument.kind==='Identifier'?this.read(e.argument,true):this.expression(e.argument);if(e.operator==='void')return this.constant(undefined);
        const dest=this.slot();this.emit({kind:'unary',dest,operator:e.operator,argument});return dest;
      }
      case 'Update': {
        if((e.argument as A.Node).kind==='Call')return this.callTargetError(e.argument as unknown as A.Call);
        const ref=this.settledReference(this.reference(e.argument)),previous=this.getReference(ref),numeric=this.slot();this.emit({kind:'unary',dest:numeric,operator:'numeric',argument:previous});
        const next=this.slot();this.emit({kind:'unary',dest:next,operator:e.operator==='++'?'increment':'decrement',argument:numeric});
        this.putReference(ref,next);return e.prefix?next:numeric;
      }
      case 'Assignment': {
        if(e.left.kind==='ArrayPattern'||e.left.kind==='ObjectPattern'){
          const right=this.expression(e.right);this.bindPattern(e.left,right,false,true);return right;
        }
        if((e.left as A.Node).kind==='Call')return this.callTargetError(e.left as unknown as A.Call);
        // Compound assignment reads its left value BEFORE evaluating the RHS.
        const raw=this.reference(e.left,e.operator==='='),ref=e.operator==='='?raw:this.settledReference(raw),previous=e.operator==='='?null:this.getReference(ref);
        const right=this.expression(e.right,e.operator==='='&&e.left.kind==='Identifier'&&!e.parenthesizedTarget?e.left.name:undefined);
        let result=right;if(previous!==null){result=this.slot();this.emit({kind:'binary',dest:result,operator:e.operator.slice(0,-1),left:previous,right});}
        this.putReference(ref,result);return result;
      }
      case 'New': {
        const callee=this.expression(e.callee),args=this.lowerArguments(e.arguments);
        const instance=this.slot(),result=this.slot(),dest=this.slot();
        this.emit({kind:'newInstance',dest:instance,callee,
          ...('array'in args?{argumentArray:args.array}:args.fixed.length?{firstArgument:args.fixed[0]}:{})});
        this.invokeWithArguments(result,callee,args,instance,true);
        this.emit({kind:'constructorResult',dest,result,instance});return dest;
      }
      case 'Call': {
        // Runtime helpers called by transformed code (eval-aot): \u0001name(args).
        if(e.callee.kind==='Identifier'&&e.callee.name.startsWith('\u0001'))
          return this.preludeCall(e.callee.name.slice(1),e.arguments.map(arg=>this.expression(arg as A.Expression)));
        if(e.callee.kind==='Super'){
          const result=this.slot(),dest=this.slot();let base=this.slot(),receiver=this.slot();
          if(e.superRefs){this.emit({kind:'superConstructor',dest:base,func:this.read(e.superRefs.func)});receiver=this.read(e.superRefs.receiver);}
          else{this.emit({kind:'superConstructor',dest:base});this.emit({kind:'superReceiver',dest:receiver});}
          const target=this.slot();this.emit({kind:'newTarget',dest:target});
          this.invokeWithArguments(result,base,this.lowerArguments(e.arguments),receiver,true,target);
          this.emit({kind:'constructorResult',dest,result,instance:receiver});this.emit({kind:'setCurrentThis',source:dest});return dest;
        }
        if(e.callee.kind==='Identifier'&&this.bound.withChains.has(e.callee)){
          // A function found in an object environment is called with that object as this.
          const ref=this.reference(e.callee),withRef=(ref as {withRef:WithReference}).withRef;
          const receiver=this.withBranch(withRef,()=>withRef.object,()=>this.constant(undefined));
          const callee=this.getReference(ref),args=this.lowerArguments(e.arguments),dest=this.slot();
          this.invokeWithArguments(dest,callee,args,receiver);return dest;
        }
        const optional=e.callee.kind==='OptionalChain'?this.optionalChainCallee(e.callee):undefined;
        const ref=!optional&&e.callee.kind==='Member'?this.reference(e.callee):undefined;
        const receiver=optional?.receiver??(ref&&'object'in ref?(ref.receiver??ref.object):undefined);
        const callee=optional?.callee??(ref?this.getReference(ref):this.expression(e.callee));
        const args=this.lowerArguments(e.arguments),dest=this.slot();
        this.invokeWithArguments(dest,callee,args,receiver,false,undefined,this.tailCalls.has(e));return dest;
      }
      case 'Binary': {
        const left=this.expression(e.left);
        if(e.operator===',')return this.expression(e.right);
        if(e.operator==='&&'||e.operator==='||'||e.operator==='??') {
          const dest=this.slot();this.emit({kind:'copy',dest,source:left});const rightBlock=this.block(),join=this.block();
          let condition=left;
          if(e.operator==='??'){condition=this.slot();this.emit({kind:'unary',dest:condition,operator:'isNullish',argument:left});}
          this.end({kind:'branch',condition,yes:e.operator==='||'?join.id:rightBlock.id,no:e.operator==='||'?rightBlock.id:join.id});
          this.select(rightBlock);const right=this.expression(e.right);this.emit({kind:'copy',dest,source:right});this.end({kind:'jump',target:join.id});
          this.select(join);return dest;
        }
        const right=this.expression(e.right),dest=this.slot();
        if(e.operator==='in'){
          // The RHS must be checked before coercing the property key.
          this.emit({kind:'property',operation:'has',dest,object:right,key:left});
        }else this.emit({kind:'binary',dest,operator:e.operator,left,right});return dest;
      }
      case 'Conditional': {
        const condition=this.expression(e.test),yes=this.block(),no=this.block(),join=this.block(),dest=this.slot();
        this.end({kind:'branch',condition,yes:yes.id,no:no.id});this.select(yes);const a=this.expression(e.consequent);this.emit({kind:'copy',dest,source:a});this.end({kind:'jump',target:join.id});
        this.select(no);const b=this.expression(e.alternate);this.emit({kind:'copy',dest,source:b});this.end({kind:'jump',target:join.id});this.select(join);return dest;
      }
    }
  }
  private complete(term:Terminator,handlerDepth:number,finalizerDepth:number,closeIterators:number[]=[]):void {
    const handlers=this.handlers,finalizers=this.finalizers,controls=this.controls;
    this.handlers=[...handlers];
    for(let i=finalizers.length-1;i>=finalizerDepth;i--){
      const finalizer=finalizers[i]!;
      while(this.handlers.length>finalizer.handlerDepth){this.emit({kind:'popHandler'});this.handlers.pop();}
      this.finalizers=finalizers.slice(0,i);this.controls=[...finalizer.controls];
      // A fresh block records the outer exceptional edge after handler removal.
      const entry=this.block();this.end({kind:'jump',target:entry.id});this.select(entry);
      this.statement(finalizer.body);if(this.terminated)break;
    }
    if(!this.terminated){
      while(this.handlers.length>handlerDepth){this.emit({kind:'popHandler'});this.handlers.pop();}
      for(const iterator of closeIterators){
        const doneFlag=this.iteratorDoneFlags.get(iterator);
        if(doneFlag!==undefined){
          const close=this.block(),skip=this.block();this.end({kind:'branch',condition:doneFlag,yes:skip.id,no:close.id});
          this.select(close);this.emit({kind:'iteratorClose',iterator});this.end({kind:'jump',target:skip.id});this.select(skip);
        }
        else if(this.asyncIterators.has(iterator))this.asyncIteratorClose(iterator);
        else this.emit({kind:'iteratorClose',iterator});
      }
      // A derived constructor checks its result after leaving every try block ([[Construct]] step 10-12).
      if(term.kind==='return'&&this.fn?.declaration.kind==='FunctionExpression'&&this.fn.declaration.derivedConstructor){
        const entry=this.block();this.end({kind:'jump',target:entry.id});this.select(entry);
        const checked=this.slot();this.emit({kind:'derivedReturn',dest:checked,source:term.value});term={kind:'return',value:checked};
      }
      this.end(term);
    }
    this.handlers=handlers;this.finalizers=finalizers;this.controls=controls;
  }
  /** AsyncIteratorClose for a normal completion: await return() and require an object. */
  private asyncIteratorClose(iterator:number):void {
    const method=this.slot(),missing=this.slot(),result=this.slot(),awaited=this.slot(),call=this.block(),join=this.block();
    this.emit({kind:'property',operation:'get',dest:method,object:iterator,key:this.constant('return')});
    this.emit({kind:'unary',dest:missing,operator:'isNullish',argument:method});
    this.end({kind:'branch',condition:missing,yes:join.id,no:call.id});
    this.select(call);this.emit({kind:'invoke',dest:result,callee:method,arguments:[],receiver:iterator});
    this.emit({kind:'await',dest:awaited,source:result});this.emit({kind:'requireObject',source:awaited});
    this.end({kind:'jump',target:join.id});this.select(join);
  }
  /** yield* in an async generator (YieldExpression evaluation, generatorKind async). */
  private asyncYieldStar(argument:A.Expression):number {
    const object=this.expression(argument),iterator=this.slot(),next=this.slot(),result=this.slot(),sent=this.slot(),mode=this.slot(),value=this.slot();
    const doneKey=this.constant('done'),valueKey=this.constant('value'),throwKey=this.constant('throw'),returnKey=this.constant('return');
    const one=this.constant(1),two=this.constant(2),undefinedValue=this.constant(undefined);
    this.maxArguments=Math.max(this.maxArguments,1);
    this.emit({kind:'call',dest:iterator,target:'rt.prelude.getAsyncIterator',arguments:[object]});
    this.emit({kind:'property',operation:'get',dest:next,object:iterator,key:this.constant('next')});
    const raw=this.slot(),returning=this.slot();
    this.emit({kind:'copy',dest:returning,source:this.constant(false)});
    this.emit({kind:'invoke',dest:raw,callee:next,arguments:[undefinedValue],receiver:iterator});
    const inspect=this.block(),yielded=this.block(),dispatch=this.block(),again=this.block(),throwEntry=this.block(),returnEntry=this.block(),completion=this.block();
    this.end({kind:'jump',target:inspect.id});this.select(inspect);
    // Every inner result is awaited, then must be an object.
    this.emit({kind:'await',dest:result,source:raw});this.emit({kind:'requireObject',source:result});
    const done=this.slot();this.emit({kind:'property',operation:'get',dest:done,object:result,key:doneKey});
    this.end({kind:'branch',condition:done,yes:completion.id,no:yielded.id});
    this.select(yielded);const yieldedValue=this.slot();this.emit({kind:'property',operation:'get',dest:yieldedValue,object:result,key:valueKey});
    this.emit({kind:'yieldDelegated',dest:sent,mode,source:yieldedValue,value:true});this.end({kind:'jump',target:dispatch.id});
    this.select(dispatch);const isThrow=this.slot();this.emit({kind:'binary',dest:isThrow,operator:'===',left:mode,right:one});
    const checkReturn=this.block();this.end({kind:'branch',condition:isThrow,yes:throwEntry.id,no:checkReturn.id});
    this.select(checkReturn);const isReturn=this.slot();this.emit({kind:'binary',dest:isReturn,operator:'===',left:mode,right:two});
    this.end({kind:'branch',condition:isReturn,yes:returnEntry.id,no:again.id});
    this.select(again);this.emit({kind:'copy',dest:returning,source:this.constant(false)});
    this.emit({kind:'invoke',dest:raw,callee:next,arguments:[sent],receiver:iterator});this.end({kind:'jump',target:inspect.id});
    this.select(throwEntry);const throwMethod=this.slot(),throwMissing=this.slot(),noThrow=this.block(),invokeThrow=this.block();
    this.emit({kind:'property',operation:'get',dest:throwMethod,object:iterator,key:throwKey});
    this.emit({kind:'unary',dest:throwMissing,operator:'isNullish',argument:throwMethod});this.end({kind:'branch',condition:throwMissing,yes:noThrow.id,no:invokeThrow.id});
    this.select(noThrow);this.asyncIteratorClose(iterator);this.emit({kind:'immutableWrite'});this.end({kind:'throw',value:sent});
    this.select(invokeThrow);this.emit({kind:'copy',dest:returning,source:this.constant(false)});
    this.emit({kind:'invoke',dest:raw,callee:throwMethod,arguments:[sent],receiver:iterator});this.end({kind:'jump',target:inspect.id});
    this.select(returnEntry);const returnMethod=this.slot(),returnMissing=this.slot(),noReturn=this.block(),invokeReturn=this.block();
    this.emit({kind:'property',operation:'get',dest:returnMethod,object:iterator,key:returnKey});
    this.emit({kind:'unary',dest:returnMissing,operator:'isNullish',argument:returnMethod});this.end({kind:'branch',condition:returnMissing,yes:noReturn.id,no:invokeReturn.id});
    const closeOuter=()=>[...this.controls].reverse().flatMap(c=>c.iterator===undefined?[]:[c.iterator]);
    this.select(noReturn);const awaitedSent=this.slot();this.emit({kind:'await',dest:awaitedSent,source:sent});
    this.complete({kind:'return',value:awaitedSent},0,0,closeOuter());
    this.select(invokeReturn);this.emit({kind:'copy',dest:returning,source:this.constant(true)});
    this.emit({kind:'invoke',dest:raw,callee:returnMethod,arguments:[sent],receiver:iterator});this.end({kind:'jump',target:inspect.id});
    const abruptReturn=this.block(),finish=this.block();
    this.select(completion);this.emit({kind:'property',operation:'get',dest:value,object:result,key:valueKey});
    this.end({kind:'branch',condition:returning,yes:abruptReturn.id,no:finish.id});
    this.select(abruptReturn);const awaitedValue=this.slot();this.emit({kind:'await',dest:awaitedValue,source:value});
    this.complete({kind:'return',value:awaitedValue},0,0,closeOuter());
    this.select(finish);return value;
  }
  /** for await (... of ...): ES2020 ForIn/OfBodyEvaluation with iterationKind async. */
  private forAwaitOf(s:A.ForOf,labels:string[]):void {
    if(s.left.kind==='Var'&&s.left.declarationKind!=='var')this.enterScope(s);
    const object=this.expression(s.right),iterator=this.slot(),next=this.slot();
    this.maxArguments=Math.max(this.maxArguments,1);
    this.emit({kind:'call',dest:iterator,target:'rt.prelude.getAsyncIterator',arguments:[object]});
    this.emit({kind:'property',operation:'get',dest:next,object:iterator,key:this.constant('next')});
    this.asyncIterators.add(iterator);
    const cond=this.block(),bodyEntry=this.block(),update=this.block(),join=this.block(),caught=this.block(),error=this.slot(),handlerIndex=this.handlerCount++;
    this.end({kind:'jump',target:cond.id});this.select(cond);
    const result=this.slot(),awaited=this.slot(),done=this.slot(),key=this.slot();
    this.emit({kind:'invoke',dest:result,callee:next,arguments:[],receiver:iterator});
    this.emit({kind:'await',dest:awaited,source:result});this.emit({kind:'requireObject',source:awaited});
    this.emit({kind:'property',operation:'get',dest:done,object:awaited,key:this.constant('done')});
    const valueBlock=this.block();this.end({kind:'branch',condition:done,yes:join.id,no:valueBlock.id});
    this.select(valueBlock);this.emit({kind:'property',operation:'get',dest:key,object:awaited,key:this.constant('value')});
    this.end({kind:'jump',target:bodyEntry.id});
    this.controls.push({handlerDepth:this.handlers.length,finalizerDepth:this.finalizers.length,stop:join.id,next:update.id,labels,unlabelledBreak:true,iterator});
    this.select(bodyEntry);this.emit({kind:'pushHandler',index:handlerIndex,target:caught.id,error,handlerKind:'finally'});this.handlers.push(caught.id);
    const body=this.block();this.end({kind:'jump',target:body.id});this.select(body);
    if(s.left.kind==='Var'&&s.left.declarationKind!=='var')this.enterScope(s);
    this.assignLoopTarget(s.left,key);this.statement(s.body);
    if(!this.terminated){this.emit({kind:'popHandler'});this.end({kind:'jump',target:update.id});}
    this.handlers.pop();
    // A throw completion closes the iterator and then rethrows the original error.
    const rethrow=this.block(),closeFailed=this.block(),closeError=this.slot(),closeIndex=this.handlerCount++;
    this.select(caught);this.returnMarkerBranch(error,()=>this.asyncIteratorClose(iterator));this.emit({kind:'pushHandler',index:closeIndex,target:closeFailed.id,error:closeError});this.handlers.push(closeFailed.id);
    const closing=this.block();this.end({kind:'jump',target:closing.id});this.select(closing);
    const method=this.slot(),missing=this.slot(),closeResult=this.slot(),closeAwaited=this.slot(),call=this.block(),closed=this.block();
    this.emit({kind:'property',operation:'get',dest:method,object:iterator,key:this.constant('return')});
    this.emit({kind:'unary',dest:missing,operator:'isNullish',argument:method});
    this.end({kind:'branch',condition:missing,yes:closed.id,no:call.id});
    this.select(call);this.emit({kind:'invoke',dest:closeResult,callee:method,arguments:[],receiver:iterator});
    this.emit({kind:'await',dest:closeAwaited,source:closeResult});this.end({kind:'jump',target:closed.id});
    this.select(closed);this.emit({kind:'popHandler'});this.end({kind:'jump',target:rethrow.id});this.handlers.pop();
    this.select(closeFailed);this.end({kind:'jump',target:rethrow.id});this.select(rethrow);this.end({kind:'throw',value:error});
    this.select(update);this.end({kind:'jump',target:cond.id});
    this.controls.pop();this.select(join);
  }
  private tryCatch(s:A.Try):void {
    if(!s.handler){this.statement(s.body);return;}
    const caught=this.block(),join=this.block(),error=this.slot(),index=this.handlerCount++;
    this.emit({kind:'pushHandler',index,target:caught.id,error});this.handlers.push(caught.id);
    const body=this.block();this.end({kind:'jump',target:body.id});this.select(body);this.statement(s.body);
    if(!this.terminated){this.emit({kind:'popHandler'});this.end({kind:'jump',target:join.id});}
    this.handlers.pop();this.select(caught);
    if(s.parameter?.kind==='Identifier'){const binding=this.binding(s.parameter) as StorageBinding;if(binding.captured)this.emit({kind:'newCell',dest:binding.index,source:error});else this.store(binding,error);}
    else if(s.parameter){
      // Pattern bindings start uninitialized (TDZ for initializers), then bind like a let declaration.
      for(const id of boundNames(s.parameter)){
        const binding=this.binding(id) as StorageBinding,empty=this.slot();this.emit({kind:'uninitialized',dest:empty});
        if(binding.captured)this.emit({kind:'newCell',dest:binding.index,source:empty});else this.store(binding,empty);
      }
      this.bindPattern(s.parameter,error,true);
    }
    this.statement(s.handler);if(!this.terminated)this.end({kind:'jump',target:join.id});this.select(join);
  }
  private statement(s:A.Statement,labels:string[]=[]):void {
    if(this.terminated)return;
    switch(s.kind){
      case 'Throw':this.end({kind:'throw',value:this.expression(s.argument)});break;
      case 'Try':{
        if(!s.finalizer){this.tryCatch(s);break;}
        const caught=this.block(),normal=this.block(),join=this.block(),error=this.slot(),index=this.handlerCount++;
        this.finalizers.push({body:s.finalizer,handlerDepth:this.handlers.length,controls:[...this.controls]});
        this.emit({kind:'pushHandler',index,target:caught.id,error,handlerKind:'finally'});this.handlers.push(caught.id);
        const body=this.block();this.end({kind:'jump',target:body.id});this.select(body);this.tryCatch(s);
        if(!this.terminated){this.emit({kind:'popHandler'});this.end({kind:'jump',target:normal.id});}
        this.handlers.pop();this.finalizers.pop();
        this.select(normal);this.statement(s.finalizer);if(!this.terminated)this.end({kind:'jump',target:join.id});
        this.select(caught);this.statement(s.finalizer);if(!this.terminated)this.end({kind:'throw',value:error});
        this.select(join);break;
      }
      case 'Function':{
        // Annex B.3.3: evaluating the declaration copies the block binding to the var binding.
        const target=this.bound.annexBFunctions?.get(s);
        if(target)this.store(target,this.readStatic(s.id));
        break;
      }
      case 'Empty':case 'Debugger':case 'Import':break;
      case 'Export':{
        if(s.declaration)this.statement(s.declaration);
        else if(s.defaultExpression){
          const value=this.expression(s.defaultExpression,'default');
          this.write(s.defaultId!,value,true);
        }
        break;
      }
      case 'Class':this.write(s.id,this.classValue(s),true);break;
      case 'Block':this.enterScope(s);s.body.forEach(v=>this.statement(v));break;
      case 'With':{
        const object=this.preludeCall('withObject',[this.expression(s.object)]);
        this.enterScope(s);this.store(this.bound.bindings.get(s) as StorageBinding,object);
        this.statement(s.body);break;
      }
      case 'Var':for(const d of s.declarations){
        if(d.init&&s.declarationKind==='var'&&d.id.kind==='Identifier'&&this.bound.withChains.has(d.id)){
          // The reference is resolved through with objects before the initializer runs.
          const ref=this.withResolution(d.id)!;this.write(d.id,this.expression(d.init,d.id.name),false,ref);
        }
        else if(d.init)this.bindPattern(d.id,this.expression(d.init,d.id.kind==='Identifier'?d.id.name:undefined),s.declarationKind!=='var');
        else if(s.declarationKind!=='var'&&d.id.kind==='Identifier')this.write(d.id,this.constant(undefined),true);
      }break;
      case 'ExpressionStatement':this.expression(s.expression);break;
      case 'Return':{
        const derived=this.fn?.declaration.kind==='FunctionExpression'&&this.fn.declaration.derivedConstructor;
        if(s.argument&&this.tailPosition())this.collectTailCalls(s.argument);
        let value=s.argument?this.expression(s.argument):this.constant(undefined);
        // Async generator return awaits its operand (ES2020 14.4.14 Return).
        if(s.argument&&this.fn?.declaration.async&&this.fn.declaration.generator){const awaited=this.slot();this.emit({kind:'await',dest:awaited,source:value});value=awaited;}
        this.complete({kind:'return',value},0,0,[...this.controls].reverse().flatMap(c=>c.iterator===undefined?[]:[c.iterator]));break;
      }
      case 'Break':case 'Continue': {
        const target=[...this.controls].reverse().find(c=>s.label?c.labels.includes(s.label.name):s.kind==='Break'?c.unlabelledBreak:c.next!==undefined);
        if(!target)throw new Error('Missing validated control target');
        const targetIndex=this.controls.lastIndexOf(target),exited=this.controls.slice(s.kind==='Break'?targetIndex:targetIndex+1).reverse().flatMap(c=>c.iterator===undefined?[]:[c.iterator]);
        this.complete({kind:'jump',target:s.kind==='Break'?target.stop:target.next!},target.handlerDepth,target.finalizerDepth,exited);break;
      }
      case 'Labeled': {
        const names=[...labels,s.label.name];let body=s.body;
        while(body.kind==='Labeled'){names.push(body.label.name);body=body.body;}
        if(body.kind==='While'||body.kind==='DoWhile'||body.kind==='For'||body.kind==='ForIn'||body.kind==='ForOf'||body.kind==='Switch')this.statement(body,names);
        else {
          const join=this.block();this.controls.push({handlerDepth:this.handlers.length,finalizerDepth:this.finalizers.length,stop:join.id,labels:names,unlabelledBreak:false});
          this.statement(body);if(!this.terminated)this.end({kind:'jump',target:join.id});
          this.controls.pop();this.select(join);
        }
        break;
      }
      case 'Switch': {
        const discriminant=this.expression(s.discriminant),join=this.block();
        this.enterScope(s);
        const bodies=s.cases.map(()=>this.block());let fallback=join.id;
        for(const [i,c] of s.cases.entries()) {
          if(!c.test){fallback=bodies[i]!.id;continue;}
          const right=this.expression(c.test),condition=this.slot(),next=this.block();
          this.emit({kind:'binary',dest:condition,operator:'===',left:discriminant,right});
          this.end({kind:'branch',condition,yes:bodies[i]!.id,no:next.id});this.select(next);
        }
        this.end({kind:'jump',target:fallback});
        this.controls.push({handlerDepth:this.handlers.length,finalizerDepth:this.finalizers.length,stop:join.id,labels,unlabelledBreak:true});
        s.cases.forEach((c,i)=>{
          this.select(bodies[i]!);c.body.forEach(stmt=>this.statement(stmt));
          if(!this.terminated)this.end({kind:'jump',target:bodies[i+1]?.id??join.id});
        });
        this.controls.pop();this.select(join);break;
      }
      case 'If': {
        const condition=this.expression(s.test),yes=this.block(),no=this.block(),join=this.block();
        this.end({kind:'branch',condition,yes:yes.id,no:no.id});this.select(yes);this.statement(s.consequent);if(!this.terminated)this.end({kind:'jump',target:join.id});
        this.select(no);if(s.alternate)this.statement(s.alternate);if(!this.terminated)this.end({kind:'jump',target:join.id});this.select(join);break;
      }
      case 'ForOf':{
        if(s.await){this.forAwaitOf(s,labels);break;}
        if(s.left.kind==='Var'&&s.left.declarationKind!=='var')this.enterScope(s);
        const object=this.expression(s.right),iterator=this.slot(),next=this.slot();
        this.emit({kind:'getIterator',iterator,next,object});
        const cond=this.block(),bodyEntry=this.block(),update=this.block(),join=this.block(),caught=this.block(),error=this.slot(),handlerIndex=this.handlerCount++;
        this.end({kind:'jump',target:cond.id});this.select(cond);
        const key=this.slot(),done=this.slot();this.emit({kind:'iteratorStep',dest:key,done,iterator,next});
        this.end({kind:'branch',condition:done,yes:join.id,no:bodyEntry.id});
        this.controls.push({handlerDepth:this.handlers.length,finalizerDepth:this.finalizers.length,stop:join.id,next:update.id,labels,unlabelledBreak:true,iterator});
        this.select(bodyEntry);this.emit({kind:'pushHandler',index:handlerIndex,target:caught.id,error,handlerKind:'finally'});this.handlers.push(caught.id);
        const body=this.block();this.end({kind:'jump',target:body.id});this.select(body);
        if(s.left.kind==='Var'&&s.left.declarationKind!=='var')this.enterScope(s);
        this.assignLoopTarget(s.left,key);this.statement(s.body);
        if(!this.terminated){this.emit({kind:'popHandler'});this.end({kind:'jump',target:update.id});}
        this.handlers.pop();
        const rethrow=this.block(),closeFailed=this.block(),closeError=this.slot(),closeIndex=this.handlerCount++;
        this.select(caught);this.returnMarkerBranch(error,()=>this.emit({kind:'iteratorClose',iterator}));this.emit({kind:'pushHandler',index:closeIndex,target:closeFailed.id,error:closeError});this.handlers.push(closeFailed.id);
        const closing=this.block();this.end({kind:'jump',target:closing.id});this.select(closing);
        this.emit({kind:'iteratorClose',iterator});this.emit({kind:'popHandler'});this.end({kind:'jump',target:rethrow.id});this.handlers.pop();
        this.select(closeFailed);this.end({kind:'jump',target:rethrow.id});this.select(rethrow);this.end({kind:'throw',value:error});
        this.select(update);this.end({kind:'jump',target:cond.id});
        this.controls.pop();this.select(join);break;
      }
      case 'ForIn':{
        if(s.left.kind==='Var'&&s.left.annexBInitializer){const d=s.left.declarations[0]!;this.write(d.id as A.Identifier,this.expression(d.init!,(d.id as A.Identifier).name));}
        if(s.left.kind==='Var'&&s.left.declarationKind!=='var')this.enterScope(s);
        const object=this.expression(s.right),keys=this.slot();
        this.emit({kind:'forInKeys',dest:keys,object});
        const index=this.slot(),zero=this.constant(0),one=this.constant(1),lengthKey=this.constant('length');
        this.emit({kind:'copy',dest:index,source:zero});
        const cond=this.block(),body=this.block(),update=this.block(),join=this.block();
        this.end({kind:'jump',target:cond.id});this.select(cond);
        const length=this.slot(),active=this.slot();this.emit({kind:'property',operation:'get',dest:length,object:keys,key:lengthKey});
        this.emit({kind:'binary',dest:active,operator:'<',left:index,right:length});
        this.end({kind:'branch',condition:active,yes:body.id,no:join.id});
        this.controls.push({handlerDepth:this.handlers.length,finalizerDepth:this.finalizers.length,stop:join.id,next:update.id,labels,unlabelledBreak:true});
        this.select(body);const key=this.slot();
        this.emit({kind:'property',operation:'get',dest:key,object:keys,key:index});
        const present=this.slot(),yieldBody=this.block();this.emit({kind:'forInHas',dest:present,object,key});
        this.end({kind:'branch',condition:present,yes:yieldBody.id,no:update.id});this.select(yieldBody);
        if(s.left.kind==='Var'&&s.left.declarationKind!=='var')this.enterScope(s);
        this.assignLoopTarget(s.left,key);this.statement(s.body);
        if(!this.terminated)this.end({kind:'jump',target:update.id});
        this.select(update);const next=this.slot();this.emit({kind:'binary',dest:next,operator:'+',left:index,right:one});this.emit({kind:'copy',dest:index,source:next});this.end({kind:'jump',target:cond.id});
        this.controls.pop();this.select(join);break;
      }
      case 'While':case 'DoWhile':case 'For': {
        if(s.kind==='For')this.enterScope(s);
        if(s.kind==='For'&&s.init){if(s.init.kind==='Var')this.statement(s.init);else this.expression(s.init);}
        if(s.kind==='For')this.cloneIteration(s);
        const cond=this.block(),body=this.block(),update=this.block(),join=this.block();
        this.end({kind:'jump',target:s.kind==='DoWhile'?body.id:cond.id});this.select(cond);
        if(s.test)this.end({kind:'branch',condition:this.expression(s.test),yes:body.id,no:join.id});else this.end({kind:'jump',target:body.id});
        this.controls.push({handlerDepth:this.handlers.length,finalizerDepth:this.finalizers.length,stop:join.id,next:s.kind==='For'?update.id:cond.id,labels,unlabelledBreak:true});this.select(body);this.statement(s.body);if(!this.terminated)this.end({kind:'jump',target:update.id});
        this.select(update);if(s.kind==='For'){this.cloneIteration(s);if(s.update)this.expression(s.update);}this.end({kind:'jump',target:cond.id});this.controls.pop();this.select(join);break;
      }
    }
  }
  run(body:A.Statement[]):FunctionIR {
    for(const [index,binding] of (this.fn?.captures??[]).entries()){
      const dest=this.slot();this.captureSlots.set(binding,dest);this.emit({kind:'loadCapture',dest,index});
    }
    const needsInitialization=!!this.fn&&(!!this.fn.declaration.defaults?.some(Boolean)||this.fn.declaration.parameters.some(p=>p.kind!=='Identifier')||!!this.fn.declaration.rest&&this.fn.declaration.rest.kind!=='Identifier'),incoming:number[]=[];
    if(needsInitialization){
      // Preserve the call arguments while all parameter bindings start in TDZ.
      // Each binding is initialized only when its position is reached below.
      for(const parameter of this.fn!.parameters){const copy=this.slot();this.emit({kind:'copy',dest:copy,source:parameter.index});incoming.push(copy);}
      const uninitialized=this.slot();this.emit({kind:'uninitialized',dest:uninitialized});
      for(const parameter of this.fn!.locals)if(parameter.kind==='parameter')this.emit({kind:'copy',dest:parameter.index,source:uninitialized});
    }
    for(const binding of this.fn?.locals??this.bound.mainLocals)if(binding.captured&&!binding.lexical&&binding!==this.fn?.self){
      const source=binding.kind==='parameter'?binding.index:this.constant(undefined);
      this.emit({kind:'newCell',dest:binding.index,source});
    }
    if(this.fn?.self){
      const self=this.fn.self,source=this.slot();this.emit({kind:'currentFunction',dest:source});
      if(self.captured)this.emit({kind:'newCell',dest:self.index,source});
      else this.emit({kind:'copy',dest:self.index,source});
    }
    if(this.fn?.argumentsBinding){
      const last=new Map(this.fn.parameters.map(p=>[p.name,p]));
      const unmapped=!!this.fn.restParameter||!!this.fn.declaration.defaults?.some(Boolean)||this.fn.declaration.parameters.some(id=>id.kind!=='Identifier');
      const dest=this.slot();this.emit({kind:'newArguments',dest,...(unmapped?{unmapped:true}:{}),parameters:this.fn.parameters.map(p=>!this.fn!.strict&&!this.fn!.restParameter&&!this.fn!.declaration.defaults?.some(Boolean)&&this.fn!.declaration.parameters.every(id=>id.kind==='Identifier')&&last.get(p.name)===p?this.cellSlot(p):-1)});
      this.store(this.fn.argumentsBinding,dest);
    }
    if(needsInitialization){
      for(const [index,pattern] of this.fn!.declaration.parameters.entries()){
        const init=this.fn!.declaration.defaults?.[index];
        if(!init){this.bindPattern(pattern,incoming[index]!,true);continue;}
        const undefinedValue=this.constant(undefined),condition=this.slot();
        this.emit({kind:'binary',dest:condition,operator:'===',left:incoming[index]!,right:undefinedValue});
        const initialize=this.block(),provided=this.block(),next=this.block();this.end({kind:'branch',condition,yes:initialize.id,no:provided.id});
        this.select(initialize);this.bindPattern(pattern,this.expression(init),true);this.end({kind:'jump',target:next.id});
        this.select(provided);this.bindPattern(pattern,incoming[index]!,true);this.end({kind:'jump',target:next.id});this.select(next);
      }
    }
    if(this.fn?.restParameter){
      const dest=this.slot();this.emit({kind:'newRestArray',dest,start:this.fn.parameters.length});
      this.bindPattern(this.fn.declaration.rest!,dest,true);
    }
    const moduleBody=this.moduleIndex!==undefined&&this.moduleIndex>=0;
    if(!moduleBody)this.enterScope(this.fn?.declaration.body??this.bound.ast);
    for(const fn of moduleBody?[]:this.fn?.declarations??this.bound.declarations){
      this.store(this.binding(fn.declaration.id!),this.closure(fn));
    }
    if(this.fn?.declaration.generator)this.emit({kind:'generatorInitialSuspend'});
    if(this.fn?.declaration.kind==='FunctionExpression'&&this.fn.declaration.derivedConstructor){
      for(const binding of this.fn.locals)if(binding.name==='#superFunction'||binding.name==='#superReceiver'){
        const value=this.slot();this.emit(binding.name==='#superFunction'?{kind:'currentFunction',dest:value}:{kind:'superReceiver',dest:value});
        this.store(binding,value);
      }
    }
    if(this.fn?.declaration.kind==='FunctionExpression'&&this.fn.declaration.derivedConstructor&&this.fn.declaration.defaultClassConstructor){
      const base=this.slot(),receiver=this.slot(),args=this.slot(),result=this.slot(),dest=this.slot();
      this.emit({kind:'superConstructor',dest:base});this.emit({kind:'superReceiver',dest:receiver});this.emit({kind:'newRestArray',dest:args,start:0});
      const target=this.slot();this.emit({kind:'newTarget',dest:target});
      this.invokeWithArguments(result,base,{array:args},receiver,true,target);this.emit({kind:'constructorResult',dest,result,instance:receiver});this.end({kind:'return',value:dest});
    }
    if(this.moduleIndex===-1)this.moduleMain();
    body.forEach(s=>this.statement(s));
    if(this.moduleIndex===-1&&this.bound.ast.module&&!this.terminated)this.preludeCall('evaluateModule',[this.constant(0)]);
    if(!this.terminated)this.end({kind:'return',value:this.fn?.declaration.kind==='FunctionExpression'&&this.fn.declaration.derivedConstructor?this.currentThis():this.constant(undefined)});
    return {id:this.fn?`js.fn.${this.fn.index}`:this.moduleIndex!==undefined&&this.moduleIndex>=0?`js.module.${this.moduleIndex}`:'js.main',name:this.fn?.declaration.id?.name??(this.fn?'<anonymous>':'<main>'),parameterCount:this.fn?.parameters.length??0,localCount:this.fn?.locals.length??this.bound.mainLocals.length,slotCount:this.slots,maxArguments:this.maxArguments,handlerCount:this.handlerCount,derivedConstructor:this.fn?.declaration.kind==='FunctionExpression'&&this.fn.declaration.derivedConstructor===true,generator:this.fn?.declaration.generator===true||this.fn?.declaration.async===true,blocks:this.blocks};
  }
}
