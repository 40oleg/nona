import type * as A from '../../frontend/ast.js';
import {CallLowerer} from './calls.js';

/** Destructuring patterns and assignment targets of loops. */
export abstract class PatternLowerer extends CallLowerer {
  protected bindPattern(pattern:A.BindingPattern,value:number,initializing:boolean,assignment=false):void {
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
      this.select(body);this.emit({kind:'setProperty',strict:true,object:array,key:index,source:item,define:true});
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
  protected returnMarkerBranch(error:number,onReturn:()=>void):void {
    const isMarker=this.slot(),returning=this.block(),other=this.block();
    this.emit({kind:'unary',dest:isMarker,operator:'isReturnMarker',argument:error});
    this.end({kind:'branch',condition:isMarker,yes:returning.id,no:other.id});
    this.select(returning);onReturn();if(!this.terminated)this.end({kind:'throw',value:error});
    this.select(other);
  }
  protected assignLoopTarget(left:A.Var|A.Assignable|A.ArrayPattern|A.ObjectPattern,value:number):void {
    if(left.kind==='Var')this.bindPattern(left.declarations[0]!.id,value,left.declarationKind!=='var');
    else if(left.kind==='ArrayPattern'||left.kind==='ObjectPattern')this.bindPattern(left,value,false,true);
    else if(left.kind==='Identifier')this.write(left,value);
    else if((left as A.Node).kind==='Call')this.callTargetError(left as unknown as A.Call);
    else this.putReference(this.reference(left),value);
  }
}
