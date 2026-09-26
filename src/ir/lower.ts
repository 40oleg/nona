import type * as A from '../frontend/ast.js';
import type { Binding,StorageBinding,BoundProgram,BoundFunction } from '../frontend/bound.js';
import type { BlockIR,FunctionIR,ModuleIR,Operation,Terminator } from './model.js';
type Reference={id:A.Identifier;resolvable?:number}|{object:number;key:number;receiver?:number};
type ChainState={kind:'value';slot:number;receiver?:number}|{kind:'reference';reference:Reference};
type Control={stop:number;next?:number;labels:string[];unlabelledBreak:boolean;handlerDepth:number;finalizerDepth:number;iterator?:number};
type Finalizer={body:A.Block;handlerDepth:number;controls:Control[]};

export function lower(bound:BoundProgram):ModuleIR {
  const functions=[new Lowerer(bound,null).run(bound.ast.body)];
  for(const f of bound.functions)functions.push(new Lowerer(bound,f).run(f.declaration.body.body));
  return {
    globalCount:bound.globals.length,
    functions,
    globalProperties:bound.globals.filter(b=>!b.lexical).map(({name,index})=>({name,index})),
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
  constructor(private bound:BoundProgram,private fn:BoundFunction|null) {
    this.slots=fn?.locals.length??bound.mainLocals.length;this.current=this.block();
  }
  private get strict():boolean{return this.fn?.strict??!!this.bound.ast.strict;}
  private slot():number{return this.slots++;}
  private block():BlockIR {const b:BlockIR={id:this.blocks.length,...(this.handlers.length?{exceptionTarget:this.handlers[this.handlers.length-1]}:{}),operations:[],terminator:{kind:'return',value:-1}};this.blocks.push(b);return b;}
  private select(b:BlockIR):void {this.current=b;this.terminated=false;}
  private emit(op:Operation):void{this.current.operations.push(op);}
  private end(t:Terminator):void{this.current.terminator=t;this.terminated=true;}
  private constant(value:undefined|null|boolean|number|string):number {const dest=this.slot();this.emit({kind:'constant',dest,value});return dest;}
  private binding(id:A.Identifier):Binding {const b=this.bound.bindings.get(id);if(!b)throw new Error(`Missing binding: ${id.name}`);return b;}
  private cellSlot(binding:StorageBinding):number {
    if(binding.owner===(this.fn?.index??-1))return binding.index;
    const slot=this.captureSlots.get(binding);if(slot===undefined)throw new Error(`Missing capture ${binding.name}`);return slot;
  }
  private closure(fn:BoundFunction,inferredName?:string|number,homeObject?:number):number {
    const dest=this.slot(),captures=fn.captures.map(binding=>this.cellSlot(binding));
    const name=fn.declaration.id?.name??inferredName??'';
    this.emit({kind:'newFunction',strict:fn.strict,dest,...(homeObject===undefined?{}:{homeObject}),method:fn.declaration.kind==='FunctionExpression'&&fn.declaration.method===true,arrow:fn.declaration.kind==='FunctionExpression'&&fn.declaration.arrow===true,target:`js.fn.${fn.index}`,captures,parameterCount:fn.parameters.length,
      sourceText:this.bound.ast.source?.slice(fn.declaration.span.start,fn.declaration.span.end),
      ...(typeof name==='number'?{nameSlot:name}:{name})});return dest;
  }
  private globalObject():number {const dest=this.slot();this.emit({kind:'globalObject',dest});return dest;}
  private read(id:A.Identifier,allowMissing=false):number {
    const b=this.binding(id),dest=this.slot();
    switch(b.kind){
      case 'parameter':case 'local':
        if(b.captured)this.emit({kind:'readCell',dest,cell:this.cellSlot(b)});
        else this.emit({kind:'copy',dest,source:b.index});break;
      case 'global':this.emit({kind:'loadGlobal',dest,index:b.index});break;
      case 'globalProperty':this.emit({kind:'readGlobalProperty',dest,name:b.name,allowMissing});break;
      default:throw new Error('Unsupported binding');
    }
    if('lexical'in b&&b.lexical)this.emit({kind:'checkInitialized',slot:dest});
    return dest;
  }
  private write(id:A.Identifier,source:number,initializing=false):void {
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
      const resolvable=preserveGlobalResolution&&this.strict&&binding.kind==='globalProperty'
        ?this.globalExists(binding.name):undefined;
      return {id:e,...(resolvable===undefined?{}:{resolvable})};
    }
    if(e.object.kind==='Super'){
      const receiver=this.slot();this.emit({kind:'currentThis',dest:receiver});
      const key=this.expression(e.property),object=this.slot();return {object,key,receiver};
    }
    // Keep the raw key: RHS effects may mutate an object used as a key.
    const object=this.expression(e.object),key=this.expression(e.property);
    return {object,key};
  }
  private globalExists(name:string):number {
    const object=this.globalObject(),key=this.constant(name),dest=this.slot();
    this.emit({kind:'property',operation:'has',dest,object,key});return dest;
  }
  private getReference(ref:Reference):number {
    if('id'in ref)return this.read(ref.id);
    const dest=this.slot();if(ref.receiver!==undefined){this.emit({kind:'superBase',dest:ref.object});const key=this.slot();this.emit({kind:'unary',dest:key,operator:'propertyKey',argument:ref.key});this.emit({kind:'superGet',dest,object:ref.object,key,receiver:ref.receiver});}else this.emit({kind:'property',operation:'get',dest,...ref});return dest;
  }
  private putReference(ref:Reference,source:number):void {
    if('id'in ref){
      const binding=this.binding(ref.id);
      if(this.strict&&binding.kind==='globalProperty'){
        if(ref.resolvable!==undefined)this.emit({kind:'checkResolvable',slot:ref.resolvable});
        this.emit({kind:'checkResolvable',slot:this.globalExists(binding.name)});
      }
      this.write(ref.id,source);
    }
    else if(ref.receiver!==undefined){this.emit({kind:'superBase',dest:ref.object});const key=this.slot();this.emit({kind:'unary',dest:key,operator:'propertyKey',argument:ref.key});this.emit({kind:'superSet',strict:this.strict,object:ref.object,key,receiver:ref.receiver,source});}
    else {
      const key=this.slot();this.emit({kind:'unary',dest:key,operator:'propertyKey',argument:ref.key});
      this.emit({kind:'setProperty',strict:this.strict,object:ref.object,key,source,define:false});
    }
  }
  private assignLoopTarget(left:A.Var|A.Assignable,value:number):void {
    if(left.kind==='Var')this.write(left.declarations[0]!.id,value,left.declarationKind!=='var');
    else if(left.kind==='Identifier')this.write(left,value);
    else this.putReference(this.reference(left),value);
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
        const args=link.arguments.map(argument=>this.expression(argument)),dest=this.slot();
        this.maxArguments=Math.max(this.maxArguments,args.length);
        this.emit({kind:'invoke',dest,callee,arguments:args,...(receiver===undefined?{}:{receiver})});state={kind:'value',slot:dest};
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
      case 'This':{const dest=this.slot();this.emit({kind:'currentThis',dest});return dest;}
      case 'Literal':return this.constant(e.value);
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
      case 'FunctionExpression':return this.closure(this.bound.functionNodes.get(e)!,inferredName);
      case 'Member':return this.getReference(this.reference(e));
      case 'OptionalChain':return this.optionalChain(e,'value');
      case 'ObjectLiteral':case 'ArrayLiteral': {
        const dest=this.slot();this.emit({kind:'newObject',dest,array:e.kind==='ArrayLiteral',length:e.kind==='ArrayLiteral'?e.elements.length:0});
        if(e.kind==='ArrayLiteral')e.elements.forEach((item,i)=>{
          if(item){const key=this.constant(String(i)),source=this.expression(item);this.emit({kind:'setProperty',strict:this.strict,object:dest,key,source,define:true});}
        });
        else for(const p of e.properties){
          const raw=this.expression(p.key),key=this.slot();this.emit({kind:'unary',dest:key,operator:'propertyKey',argument:raw});
          let functionName=key;
          if(p.accessor){const prefix=this.constant(p.accessor+' ');functionName=this.slot();this.emit({kind:'binary',dest:functionName,operator:'+',left:prefix,right:key});}
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
            const binding=this.binding(e.argument);
            if(binding.kind==='globalProperty'){
              const object=this.globalObject(),key=this.constant(binding.name),dest=this.slot();
              this.emit({kind:'property',operation:'delete',strict:this.strict,dest,object,key});return dest;
            }
            return this.constant(false);
          }
          if(e.argument.kind==='Member'){
            if(e.argument.object.kind==='Super'){this.expression(e.argument.property);this.emit({kind:'immutableWrite',error:'ReferenceError'});return this.constant(undefined);}
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
        const ref=this.reference(e.argument),previous=this.getReference(ref),numeric=this.slot();this.emit({kind:'unary',dest:numeric,operator:'+',argument:previous});
        const one=this.constant(1),next=this.slot();this.emit({kind:'binary',dest:next,operator:e.operator==='++'?'+':'-',left:numeric,right:one});
        this.putReference(ref,next);return e.prefix?next:numeric;
      }
      case 'Assignment': {
        // Compound assignment reads its left value BEFORE evaluating the RHS.
        const ref=this.reference(e.left,e.operator==='='),previous=e.operator==='='?null:this.getReference(ref);
        const right=this.expression(e.right,e.operator==='='&&e.left.kind==='Identifier'?e.left.name:undefined);
        let result=right;if(previous!==null){result=this.slot();this.emit({kind:'binary',dest:result,operator:e.operator.slice(0,-1),left:previous,right});}
        this.putReference(ref,result);return result;
      }
      case 'New': {
        const callee=this.expression(e.callee),args=e.arguments.map(a=>this.expression(a));
        const instance=this.slot(),result=this.slot(),dest=this.slot();
        this.maxArguments=Math.max(this.maxArguments,args.length);
        this.emit({kind:'newInstance',dest:instance,callee});
          this.emit({kind:'invoke',dest:result,callee,arguments:args,receiver:instance,construct:true});
        this.emit({kind:'constructorResult',dest,result,instance});return dest;
      }
      case 'Call': {
        const optional=e.callee.kind==='OptionalChain'?this.optionalChainCallee(e.callee):undefined;
        const ref=!optional&&e.callee.kind==='Member'?this.reference(e.callee):undefined;
        const receiver=optional?.receiver??(ref&&'object'in ref?(ref.receiver??ref.object):undefined);
        const callee=optional?.callee??(ref?this.getReference(ref):this.expression(e.callee));
        const args=e.arguments.map(a=>this.expression(a)),dest=this.slot();
        this.maxArguments=Math.max(this.maxArguments,args.length);
        this.emit({kind:'invoke',dest,callee,arguments:args,...(receiver===undefined?{}:{receiver})});return dest;
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
      for(const iterator of closeIterators)this.emit({kind:'iteratorClose',iterator});
      this.end(term);
    }
    this.handlers=handlers;this.finalizers=finalizers;this.controls=controls;
  }
  private tryCatch(s:A.Try):void {
    if(!s.handler){this.statement(s.body);return;}
    const caught=this.block(),join=this.block(),error=this.slot(),index=this.handlerCount++;
    this.emit({kind:'pushHandler',index,target:caught.id,error});this.handlers.push(caught.id);
    const body=this.block();this.end({kind:'jump',target:body.id});this.select(body);this.statement(s.body);
    if(!this.terminated){this.emit({kind:'popHandler'});this.end({kind:'jump',target:join.id});}
    this.handlers.pop();this.select(caught);
    if(s.parameter){const binding=this.binding(s.parameter) as StorageBinding;if(binding.captured)this.emit({kind:'newCell',dest:binding.index,source:error});else this.store(binding,error);}
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
        this.emit({kind:'pushHandler',index,target:caught.id,error});this.handlers.push(caught.id);
        const body=this.block();this.end({kind:'jump',target:body.id});this.select(body);this.tryCatch(s);
        if(!this.terminated){this.emit({kind:'popHandler'});this.end({kind:'jump',target:normal.id});}
        this.handlers.pop();this.finalizers.pop();
        this.select(normal);this.statement(s.finalizer);if(!this.terminated)this.end({kind:'jump',target:join.id});
        this.select(caught);this.statement(s.finalizer);if(!this.terminated)this.end({kind:'throw',value:error});
        this.select(join);break;
      }
      case 'Empty':case 'Debugger':case 'Function':break;
      case 'Block':this.enterScope(s);s.body.forEach(v=>this.statement(v));break;
      case 'Var':for(const d of s.declarations){
        if(d.init)this.write(d.id,this.expression(d.init,d.id.name),s.declarationKind!=='var');
        else if(s.declarationKind!=='var')this.write(d.id,this.constant(undefined),true);
      }break;
      case 'ExpressionStatement':this.expression(s.expression);break;
      case 'Return':{const value=s.argument?this.expression(s.argument):this.constant(undefined);this.complete({kind:'return',value},0,0,[...this.controls].reverse().flatMap(c=>c.iterator===undefined?[]:[c.iterator]));break;}
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
        if(s.left.kind==='Var'&&s.left.declarationKind!=='var')this.enterScope(s);
        const object=this.expression(s.right),iterator=this.slot(),next=this.slot();
        this.emit({kind:'getIterator',iterator,next,object});
        const cond=this.block(),bodyEntry=this.block(),update=this.block(),join=this.block(),caught=this.block(),error=this.slot(),handlerIndex=this.handlerCount++;
        this.end({kind:'jump',target:cond.id});this.select(cond);
        const key=this.slot(),done=this.slot();this.emit({kind:'iteratorStep',dest:key,done,iterator,next});
        this.end({kind:'branch',condition:done,yes:join.id,no:bodyEntry.id});
        this.controls.push({handlerDepth:this.handlers.length,finalizerDepth:this.finalizers.length,stop:join.id,next:update.id,labels,unlabelledBreak:true,iterator});
        this.select(bodyEntry);this.emit({kind:'pushHandler',index:handlerIndex,target:caught.id,error});this.handlers.push(caught.id);
        const body=this.block();this.end({kind:'jump',target:body.id});this.select(body);
        if(s.left.kind==='Var'&&s.left.declarationKind!=='var')this.enterScope(s);
        this.assignLoopTarget(s.left,key);this.statement(s.body);
        if(!this.terminated){this.emit({kind:'popHandler'});this.end({kind:'jump',target:update.id});}
        this.handlers.pop();
        const rethrow=this.block(),closeFailed=this.block(),closeError=this.slot(),closeIndex=this.handlerCount++;
        this.select(caught);this.emit({kind:'pushHandler',index:closeIndex,target:closeFailed.id,error:closeError});this.handlers.push(closeFailed.id);
        const closing=this.block();this.end({kind:'jump',target:closing.id});this.select(closing);
        this.emit({kind:'iteratorClose',iterator});this.emit({kind:'popHandler'});this.end({kind:'jump',target:rethrow.id});this.handlers.pop();
        this.select(closeFailed);this.end({kind:'jump',target:rethrow.id});this.select(rethrow);this.end({kind:'throw',value:error});
        this.select(update);this.end({kind:'jump',target:cond.id});
        this.controls.pop();this.select(join);break;
      }
      case 'ForIn':{
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
    for(const binding of this.fn?.locals??this.bound.mainLocals)if(binding.captured&&!binding.lexical&&binding!==this.fn?.self){
      const source=binding.kind==='parameter'?binding.index:this.constant(undefined);
      this.emit({kind:'newCell',dest:binding.index,source});
    }
    if(this.fn?.self){
      const self=this.fn.self,source=this.slot();this.emit({kind:'currentFunction',dest:source});
      if(self.captured)this.emit({kind:'newCell',dest:self.index,source});
      else this.emit({kind:'copy',dest:self.index,source});
    }
    if(this.fn?.restParameter){
      const dest=this.slot();this.emit({kind:'newRestArray',dest,start:this.fn.parameters.length});
      this.store(this.fn.restParameter,dest);
    }
    if(this.fn?.argumentsBinding){
      const last=new Map(this.fn.parameters.map(p=>[p.name,p]));
      const dest=this.slot();this.emit({kind:'newArguments',dest,parameters:this.fn.parameters.map(p=>!this.fn!.strict&&!this.fn!.restParameter&&last.get(p.name)===p?this.cellSlot(p):-1)});
      this.store(this.fn.argumentsBinding,dest);
    }
    this.enterScope(this.fn?.declaration.body??this.bound.ast);
    for(const fn of this.fn?.declarations??this.bound.declarations){
      this.store(this.binding(fn.declaration.id!),this.closure(fn));
    }
    body.forEach(s=>this.statement(s));if(!this.terminated)this.end({kind:'return',value:this.constant(undefined)});
    return {id:this.fn?`js.fn.${this.fn.index}`:'js.main',name:this.fn?.declaration.id?.name??(this.fn?'<anonymous>':'<main>'),parameterCount:this.fn?.parameters.length??0,localCount:this.fn?.locals.length??this.bound.mainLocals.length,slotCount:this.slots,maxArguments:this.maxArguments,handlerCount:this.handlerCount,blocks:this.blocks};
  }
}
