import {HandlerLayout as H,preservedGp,preservedXmm} from '../../runtime/exception-layout.js';
import {ObjectLayout as O,PropertyLayout as P,PropertyAttributes as A,maxInlineSlots} from '../../runtime/object-layout.js';
import { Assembler, assemblerSerial, reserveAssemblerSerial, setCallCounter, type Mem, type Condition } from './assembler.js';
import type { NativeProgram, NamedFragment, UnwindFunction } from '../pe/model.js';
import type { ModuleIR, FunctionIR, BlockIR, Operation } from '../../ir/model.js';
import { emitRuntime } from '../../runtime/index.js';
import { failIf } from '../../runtime/abi.js';
import { analyzeLiveness } from '../../ir/liveness.js';
import { assignLocations, destinations } from '../../ir/locations.js';
import { RootLayout as R } from '../../runtime/heap-layout.js';
import {StackBudget} from '../../runtime/context-switch.js';
import { FunctionLayout,FunctionKind } from '../../runtime/functions.js';
import { TailCallTag } from '../../runtime/tail-calls.js';
import { addCoverage, type CoverageOptions } from './coverage.js';
import { CellTag,EnvironmentLayout as E } from '../../runtime/environment-layout.js';
import {regexpVmPrelude} from '../../runtime/regexp-vm-source.js';
import {fullRuntimeLink,optionalPreludes,preludeDependencies,type OptionalPrelude,type RuntimeLink} from '../../runtime/link.js';
import {reflectPreludeSource} from '../../runtime/reflect-source.js';
import {proxyPreludeSource,preludeCleanupSource} from '../../runtime/proxy-source.js';
import {promisePreludeSource} from '../../runtime/promise-source.js';
import {encodingPreludeSource} from '../../runtime/encoding-source.js';
import {processPreludeSource,processHostDeclarations} from '../../runtime/process-source.js';
import {timersPreludeSource} from '../../runtime/timers-source.js';
import {objectAnnexBPreludeSource} from '../../runtime/object-annexb-source.js';
import {arraySortPreludeSource} from '../../runtime/array-sort-source.js';
import {objectIntegrityPreludeSource} from '../../runtime/object-integrity-source.js';
import {es2021PreludeSource} from '../../runtime/es2021-source.js';
import {annexBBuiltinsPreludeSource} from '../../runtime/annexb-builtins-source.js';
import {lex} from '../../frontend/lexer.js';
import {parse} from '../../frontend/parser.js';
import {bind} from '../../frontend/binder.js';
import {lower} from '../../ir/lower.js';
import {cloneRealms,realmSymbol} from '../realms.js';
import {mergeAgentPrograms,agentSymbol} from '../agents.js';
import {stringLiteral} from '../../runtime/value.js';
import {emitFfi} from '../../runtime/ffi.js';
import {PropertyCacheLayout,cacheableName} from '../../runtime/property-cache.js';

const binary:Record<string,string>={'+':'add','-':'sub','*':'mul','/':'div','%':'rem','**':'pow','==':'eq','!=':'eq','===':'strictEq','!==':'strictEq','<':'lt','<=':'le','>':'gt','>=':'ge','&':'bitAnd','|':'bitOr','^':'bitXor','<<':'shiftLeft','>>':'shiftRight','>>>':'shiftUnsigned','instanceof':'instanceOf'};
const unary:Record<string,string>={'+':'pos','-':'neg','!':'not','~':'bitNot',typeof:'typeof',isNullish:'isNullish',propertyKey:'toPropertyKey',propertyKeyIndex:'toPropertyKeyIndex',string:'toString',numeric:'toNumeric',increment:'increment',decrement:'decrement'};
const stack=(disp:number):Mem=>({base:'rsp',disp});
const alignedFrame=(n:number)=>Math.ceil((n+8)/16)*16-8;
/** Operations that only move values: no runtime call, no collection, no user code. */
const movesOnly=new Set<string>(['constant','copy','uninitialized','loadGlobal']);
const cachedRuntimePreludes=new Map<string,ModuleIR>();
/**
 * Runtime and prelude code are identical for equal options: generate them
 * once. `serial` is the assembler label serial after generation; a restored
 * image reserves it so later labels cannot collide with the image's.
 */
export interface BaseImage {fragments:NamedFragment[];functions:UnwindFunction[];imports:NativeProgram['imports'];literals:Map<string,string>;serial:number}
/** A store for base images that outlives the process (see src/cache.ts). Keys are option fingerprints. */
export interface BaseImageCache {get(key:string):BaseImage|undefined;set(key:string,image:BaseImage):void}
const baseImages=new Map<string,BaseImage>();

/**
 * `callStats` counts every call by target and prints the counts when the
 * program ends (see call-stats.ts); otherwise this is generateImage.
 */
export function generate(module:ModuleIR,options:{gcStress?:boolean;unhandledRejections?:'throw'|'ignore';realms?:number;agent?:boolean;agentPrograms?:NativeProgram[];link?:RuntimeLink;baseCache?:BaseImageCache;callStats?:boolean;coverage?:CoverageOptions}={}):NativeProgram {
  if(!options.callStats&&!options.coverage)return generateImage(module,options);
  if(!options.callStats)return addCoverage(module,generateImage(module,options),options.coverage!);
  const counted=new Set<string>();
  setCallCounter(target=>{if(target==='rt.callStatsReport')return undefined;counted.add(target);return 'stats.'+target;});
  let program:NativeProgram;
  try{program=generateImage(module,options);}finally{setCallCounter(undefined);}
  // A counter and a name record per target, and the table that lists them.
  const targets=[...counted].sort(),table=new Uint8Array(8+16*targets.length),fixups:NamedFragment['fixups']=[];
  new DataView(table.buffer).setBigUint64(0,BigInt(targets.length),true);
  targets.forEach((target,index)=>{
    const name=new TextEncoder().encode(target),record=new Uint8Array(8+name.length);
    new DataView(record.buffer).setBigUint64(0,BigInt(name.length),true);record.set(name,8);
    program.fragments.push({name:'stats.'+target,section:'.data',alignment:8,bytes:new Uint8Array(8),fixups:[],symbols:{}});
    program.fragments.push({name:'stats.name.'+index,section:'.rdata',alignment:8,bytes:record,fixups:[],symbols:{}});
    fixups.push({offset:8+16*index,kind:'va64',target:'stats.name.'+index,addend:0},{offset:16+16*index,kind:'va64',target:'stats.'+target,addend:0});
  });
  const fragment=program.fragments.find(f=>f.name==='rt.callStatsTable')!;
  fragment.bytes=table;fragment.fixups=fixups;
  return options.coverage?addCoverage(module,program,options.coverage):program;
}
/** The optional preludes `link` selects, with their dependencies, in declaration order. */
function linkedPreludes(link:RuntimeLink):OptionalPrelude[] {
  const selected=new Set(optionalPreludes.filter(name=>link.preludes[name]));
  for(const name of [...selected])for(const dependency of preludeDependencies[name]??[])selected.add(dependency);
  return optionalPreludes.filter(name=>selected.has(name));
}
/** `link` selects the optional runtime parts (all by default). */
function generateImage(module:ModuleIR,options:{gcStress?:boolean;unhandledRejections?:'throw'|'ignore';realms?:number;agent?:boolean;agentPrograms?:NativeProgram[];link?:RuntimeLink;baseCache?:BaseImageCache;callStats?:boolean;coverage?:CoverageOptions}={}):NativeProgram {
  const userGlobalCount=module.globalCount;
  const rejectionPolicy=options.unhandledRejections??'throw';
  const link=options.link??fullRuntimeLink;
  const regexpLink={regexp:link.regexp,unicodeProperties:link.regexp&&link.unicodeProperties};
  const linked=linkedPreludes(link);
  const hasPrelude=!!module.runtimePrelude;
  const realms=hasPrelude?options.realms??0:0;
  const baseKey=JSON.stringify({prelude:hasPrelude,rejectionPolicy,gcStress:!!options.gcStress,realms,regexpLink,unicodeNormalization:link.unicodeNormalization,linked});
  // A call-statistics build counts the runtime's calls too: it is generated afresh.
  let base=options.callStats?undefined:baseImages.get(baseKey);
  if(!base&&options.baseCache&&!options.callStats){
    base=options.baseCache.get(baseKey);
    if(base){reserveAssemblerSerial(base.serial);baseImages.set(baseKey,base);}
  }
  // The prelude is lowered only when its code has to be generated.
  const lowerPrelude=():ModuleIR=>{
    const preludeKey=JSON.stringify({rejectionPolicy,regexpLink,linked});
    let prelude=cachedRuntimePreludes.get(preludeKey);
    if(!prelude){
      const promiseSource=promisePreludeSource.replace('__NONA_FAIL_ON_UNHANDLED__',rejectionPolicy==='throw'?'true':'false');
      // Order matters: later preludes capture intrinsics installed by earlier ones.
      const parts:[OptionalPrelude|null,string][]=[[null,regexpVmPrelude(regexpLink)],[null,reflectPreludeSource],['objectAnnexB',objectAnnexBPreludeSource],['arraySort',arraySortPreludeSource],
        ['objectIntegrity',objectIntegrityPreludeSource],['annexB',annexBBuiltinsPreludeSource],['es2021',es2021PreludeSource],[null,promiseSource],['encoding',encodingPreludeSource],
        ['process',processPreludeSource],['timers',timersPreludeSource],['network',''],['proxy',proxyPreludeSource],[null,preludeCleanupSource]];
      prelude=lower(bind(parse(lex(parts.filter(([name])=>name===null||linked.includes(name)).map(([,source])=>source).join('\n')))));
      cachedRuntimePreludes.set(preludeKey,prelude);
    }
    if(prelude.globalCount!==2)throw new Error('Runtime prelude must have two global bindings');
    return prelude;
  };
  const prefix=(id:string)=>id.replace(/^js\./,'js.regexpVm.');
  const preludeFunctions=()=>(hasPrelude?lowerPrelude().functions:[]).map(fn=>({...fn,id:prefix(fn.id),blocks:fn.blocks.map(block=>({...block,
      operations:block.operations.map(op=>{
        if(op.kind==='newFunction')return {...op,target:prefix(op.target)};
        if(op.kind==='invoke'&&op.direct)return {...op,direct:prefix(op.direct)};
        if(op.kind==='loadGlobal'||op.kind==='storeGlobal')return {...op,prelude:true};
        return op;
      }),
    }))}));
  let fragments:NamedFragment[],functions:UnwindFunction[],imports:NativeProgram['imports'],literals:Map<string,string>;
  const copyFragments=(list:NamedFragment[])=>list.map(f=>({...f,bytes:f.bytes.slice(),fixups:f.fixups.map(fixup=>({...fixup})),symbols:{...f.symbols}}));
  if(base){fragments=copyFragments(base.fragments);functions=base.functions.map(fn=>({...fn}));imports=[...base.imports];literals=new Map(base.literals);}
  else{
    const runtime=emitRuntime({operations:new Set(),realms,unicodeNormalization:link.unicodeNormalization});
    fragments=[...runtime.fragments];functions=[...runtime.functions];imports=[...runtime.imports];literals=new Map();
    if(hasPrelude)fragments.find(f=>f.name==='rt.regexpVmCell')!.fixups.push({offset:0,kind:'va64',target:'rt.preludeGlobals',addend:0});
  }
  const runtime={imports};
  const literal=(value:string):string=>{
    const existing=literals.get(value);if(existing)return existing;
    const name='literal.'+literals.size, bytes=new Uint8Array(8+value.length*2),v=new DataView(bytes.buffer);
    v.setBigUint64(0,BigInt(value.length),true);for(let i=0;i<value.length;i++)v.setUint16(8+2*i,value.charCodeAt(i),true);
    literals.set(value,name);fragments.push({name,section:'.rdata',alignment:8,bytes,fixups:[],symbols:{}});return name;
  };
  if(!base){
    preludeFunctions().forEach(fn=>emitFunction(fn));
    const image:BaseImage={fragments:copyFragments(fragments),functions:functions.map(fn=>({...fn})),imports:[...imports],literals:new Map(literals),serial:assemblerSerial()};
    if(!options.callStats){baseImages.set(baseKey,image);options.baseCache?.set(baseKey,image);}
  }
  for(const name of module.globalFunctionProperties??[]){
    const property=fragments.find(f=>f.name==='rt.globalObject.'+name);
    if(!property)throw new Error('Missing intrinsic global property '+name);
    property.bytes[P.attributes]=A.writable|A.enumerable;
  }
  fragments.push({name:'js.globals',section:'.data',alignment:16,bytes:new Uint8Array(Math.max(16,module.globalCount*16)),fixups:[],symbols:{}});
  const globalProperties=module.globalProperties??[];
  const aliasBytes=new Uint8Array(Math.max(24,globalProperties.length*24));for(let i=0;i<globalProperties.length;i++)aliasBytes[i*24+16]=3;
  fragments.push({name:'js.globalBindings',section:'.data',alignment:8,bytes:aliasBytes,symbols:{},
    fixups:globalProperties.flatMap((property,i)=>[
      {offset:i*24,kind:'va64' as const,target:literal(property.name),addend:0},
      {offset:i*24+8,kind:'va64' as const,target:'js.globals',addend:property.index*16},
    ])});
  function finish(a:Assembler,name:string,size:number,prologSize:number):void {
    a.label(name+'.end');fragments.push({...a.finish(),name,section:'.text'});
    functions.push({begin:name,end:name+'.end',prologSize,allocationCodeOffset:prologSize,stackAllocation:size,savedRegisters:[]});
  }
  function emitFunction(fn:FunctionIR):void {
    // Stack +32 belongs to the outgoing fifth argument; never keep saved state there.
    const liveness=analyzeLiveness(fn),locations=assignLocations(fn,liveness);
    const a=new Assembler(fn.id),rootBase=80,valueBase=112,thisBase=valueBase+16*locations.count,newTargetBase=thisBase+16,superReceiverBase=newTargetBase+16,argsBase=superReceiverBase+16;
    let captureCount=0;for(const block of fn.blocks)for(const op of block.operations){
      if(op.kind==='newFunction')captureCount=Math.max(captureCount,op.captures?.length??0);
      if(op.kind==='newArguments')captureCount=Math.max(captureCount,op.parameters.length+1);
    }
    const handlerBase=argsBase+16*Math.max(fn.maxArguments,captureCount);
    const allocation=alignedFrame(handlerBase+H.size*(fn.handlerCount??0));
    if(!Number.isSafeInteger(allocation)||allocation>0x7ffffff0)throw new RangeError('Function stack frame exceeds supported range');
    // Stack overflow becomes a RangeError instead of a crash (rt.stackLimit).
    // Coverage: one call count per function of the program (not the preludes).
    if(options.coverage&&fn.source&&!fn.id.startsWith('js.regexpVm.'))a.incrementMemory({rip:'cov.'+fn.id});
    {const fits=a.unique('stackFits');a.lea('r11',{base:'rsp',disp:-allocation});a.load('r10',{rip:'rt.stackLimit'});a.cmp('r11','r10');a.jcc('ae',fits);
     a.sub('rsp',8);a.call('rt.throwStackOverflow');a.label(fits);}
    if(allocation>=4096){
      a.mov('r11','rsp');a.mov('rax',Math.floor(allocation/4096));
      const probe=a.unique('probe');a.label(probe);a.sub('r11',4096);a.load('r10',{base:'r11'});a.sub('rax',1);a.jcc('ne',probe);
      // Touch the last partial page before moving RSP, as Windows guard pages require.
      if(allocation%4096){a.sub('r11',allocation%4096);a.load('r10',{base:'r11'});}
    }
    a.sub('rsp',allocation);const prologSize=a.offset;
    a.store(stack(72),'rcx');a.store(stack(48),'rdx');a.store(stack(56),'r8');a.store(stack(64),'r9');
    const location=(n:number):number=>{if(n<0||n>=fn.slotCount)throw new RangeError('Invalid IR slot');return locations.location[n]!;};
    const value=(n:number):Mem=>stack(valueBase+16*location(n));
    const pointer=(reg:'rcx'|'rdx'|'r8'|'r9',n:number)=>a.lea(reg,value(n));
    const copy=(to:Mem,from:Mem)=>{
      a.load('rax',from);a.store(to,'rax');
      const add=(m:Mem):Mem=>'base'in m?{base:m.base,disp:(m.disp??0)+8}:{rip:m.rip,addend:(m.addend??0)+8};
      a.load('rax',add(from));a.store(add(to),'rax');
    };
    const payload=(n:number):Mem=>stack(valueBase+16*location(n)+8);
    const setNumber=(dest:number)=>{a.storesd(payload(dest),'xmm0');a.mov('rax',3);a.store(value(dest),'rax');};
    const setBoolean=(dest:number)=>{a.store(payload(dest),'rax');a.mov('rax',2);a.store(value(dest),'rax');};
    // Number operands are the common case of every arithmetic and relational
    // operator, and the runtime's generic path (ToPrimitive, ToNumeric,
    // BigInt dispatch, string comparison) costs a call plus several hundred
    // instructions to reach the same addsd. Test both tags inline and run
    // the SSE instruction in place; anything else falls through to the call.
    // Returns the label the caller places after the generic call, or undefined
    // when the operator has no inline form.
    const emitNumberBinary=(dest:number,operator:string,left:number,right:number):string|undefined=>{
      const arithmetic:Record<string,'addsd'|'subsd'|'mulsd'|'divsd'>={'+':'addsd','-':'subsd','*':'mulsd','/':'divsd'};
      const relation:Record<string,Condition>={'<':'b','<=':'be','>':'a','>=':'ae','==':'e','===':'e','!=':'e','!==':'e'};
      const bitwise=['&','|','^','<<','>>','>>>'];
      if(!(operator in arithmetic)&&!(operator in relation)&&!bitwise.includes(operator))return undefined;
      const slow=a.unique('generic'),done=a.unique('fastDone');
      a.load('rax',value(left));a.cmp('rax',3);a.jcc('ne',slow);a.load('rax',value(right));a.cmp('rax',3);a.jcc('ne',slow);
      if(operator in arithmetic){
        a.movsd('xmm0',payload(left));a[arithmetic[operator]!]('xmm0',payload(right));setNumber(dest);
      }else if(operator in relation){
        // ucomisd sets the parity flag for unordered (NaN) operands, where
        // every relation but != is false.
        const negated=operator==='!='||operator==='!==',holds=a.unique('holds'),store=a.unique('store');
        a.movsd('xmm0',payload(left));a.ucomisd('xmm0',payload(right));a.mov('rax',0);a.jcc('p',store);
        a.jcc(relation[operator]!,holds);a.jmp(store);a.label(holds);a.mov('rax',1);
        a.label(store);if(negated)a.xor('rax',1);setBoolean(dest);
      }else{
        // ToInt32 inline only for operands that already are int32 values:
        // truncation must round-trip and fit in 32 bits, otherwise the
        // runtime does the modular reduction.
        const toInt32=(n:number,reg:'rcx'|'r10')=>{
          a.movsd('xmm0',payload(n));a.cvttsd2si(reg,'xmm0');a.cvtsi2sd('xmm1',reg);a.ucomisd('xmm1','xmm0');a.jcc('p',slow);a.jcc('ne',slow);
          a.mov('r11',reg);a.shl('r11',32);a.sar('r11',32);a.cmp('r11',reg);a.jcc('ne',slow);
        };
        toInt32(left,'r10');toInt32(right,'rcx');
        switch(operator){
          case '&':a.and('r10','rcx');break;
          case '|':a.or('r10','rcx');break;
          case '^':a.xor('r10','rcx');break;
          case '<<':a.and('rcx',31);a.shl('r10','cl');a.shl('r10',32);a.sar('r10',32);break;
          case '>>':a.and('rcx',31);a.sar('r10','cl');break;
          case '>>>':a.and('rcx',31);a.mov('r11',0xffffffff);a.and('r10','r11');a.shr('r10','cl');break;
        }
        a.cvtsi2sd('xmm0','r10');setNumber(dest);
      }
      a.jmp(done);a.label(slow);return done;
    };
    // Operands proven Numbers by src/ir/numbers.ts: no tag checks, no runtime fallback.
    const knownArithmetic:Record<string,'addsd'|'subsd'|'mulsd'|'divsd'>={'+':'addsd','-':'subsd','*':'mulsd','/':'divsd'};
    const knownRelation:Record<string,Condition>={'<':'b','<=':'be','>':'a','>=':'ae','==':'e','===':'e','!=':'e','!==':'e'};
    const emitKnownNumberBinary=(dest:number,operator:string,left:number,right:number):boolean=>{
      if(operator in knownArithmetic){a.movsd('xmm0',payload(left));a[knownArithmetic[operator]!]('xmm0',payload(right));setNumber(dest);return true;}
      if(!(operator in knownRelation))return false;
      const negated=operator==='!='||operator==='!==',holds=a.unique('holds'),store=a.unique('store');
      a.movsd('xmm0',payload(left));a.ucomisd('xmm0',payload(right));a.mov('rax',0);a.jcc('p',store);
      a.jcc(knownRelation[operator]!,holds);a.jmp(store);a.label(holds);a.mov('rax',1);
      a.label(store);if(negated)a.xor('rax',1);setBoolean(dest);return true;
    };
    const emitKnownNumberUnary=(dest:number,operator:string,argument:number):boolean=>{
      if(!['numeric','increment','decrement','-','+'].includes(operator))return false;
      a.movsd('xmm0',payload(argument));
      if(operator==='increment'||operator==='decrement'){a.mov('rax',1);a.cvtsi2sd('xmm1','rax');if(operator==='increment')a.addsd('xmm0','xmm1');else a.subsd('xmm0','xmm1');}
      else if(operator==='-'){a.mov('rax',1n<<63n);a.movqToXmm('xmm1','rax');a.movqFromXmm('r10','xmm0');a.xor('r10','rax');a.movqToXmm('xmm0','r10');}
      setNumber(dest);return true;
    };
    const emitNumberUnary=(dest:number,operator:string,argument:number):boolean=>{
      if(!['numeric','increment','decrement','-','+','!'].includes(operator))return false;
      const slow=a.unique('generic'),done=a.unique('fastDone');
      a.load('rax',value(argument));
      if(operator==='!'){
        a.cmp('rax',2);a.jcc('ne',slow);a.load('rax',payload(argument));a.xor('rax',1);setBoolean(dest);
      }else{
        a.cmp('rax',3);a.jcc('ne',slow);a.movsd('xmm0',payload(argument));
        if(operator==='increment'||operator==='decrement'){a.mov('rax',1);a.cvtsi2sd('xmm1','rax');if(operator==='increment')a.addsd('xmm0','xmm1');else a.subsd('xmm0','xmm1');}
        else if(operator==='-'){a.mov('rax',1n<<63n);a.movqToXmm('xmm1','rax');a.movqFromXmm('r10','xmm0');a.xor('r10','rax');a.movqToXmm('xmm0','r10');}
        setNumber(dest);
      }
      a.jmp(done);a.label(slow);pointer('rcx',dest);pointer('rdx',argument);a.call('rt.'+unary[operator]);a.label(done);return true;
    };
    a.mov('rax',0);for(let i=0;i<locations.count;i++){a.store(stack(valueBase+16*i),'rax');a.store(stack(valueBase+16*i+8),'rax');}
    a.load('r10',stack(allocation+40));copy(stack(thisBase),{base:'r10'});
    copy(stack(superReceiverBase),stack(thisBase));
    if(fn.derivedConstructor){a.mov('rax',255);a.store(stack(thisBase),'rax');a.mov('rax',0);a.store(stack(thisBase+8),'rax');}
    a.load('r10',stack(allocation+48));copy(stack(newTargetBase),{base:'r10'});
    for(let i=0;i<fn.parameterCount;i++){
      const skip=a.unique('missing');a.load('rax',stack(48));a.cmp('rax',i);a.jcc('be',skip);
      a.load('r10',stack(56));copy(value(i),{base:'r10',disp:16*i});a.label(skip);
    }
    a.load('rax',{rip:'rt.gcRoots'});a.store(stack(rootBase+R.next),'rax');
    a.lea('rax',stack(valueBase));a.store(stack(rootBase+R.values),'rax');
    a.mov('rax',locations.count+3);a.store(stack(rootBase+R.count),'rax');
    a.lea('rax',stack(rootBase));a.store({rip:'rt.gcRoots'},'rax');
    if(fn.derivedConstructor){a.lea('rcx',stack(thisBase));a.lea('rdx',stack(thisBase));a.call('rt.newCell');}
    // Slots that may hold stale values when a block starts: whatever its
    // predecessors left (live slots and their last destination). Handler
    // targets can be entered from any operation, so they assume every slot.
    const allSlots=Array.from({length:fn.slotCount},(_,i)=>i);
    const handlerTargets=new Set<number>();for(const block of fn.blocks)for(const op of block.operations)if(op.kind==='pushHandler')handlerTargets.add(op.target);
    const predecessors=new Map<number,number[]>(fn.blocks.map(block=>[block.id,[]]));
    for(const block of fn.blocks){const t=block.terminator;for(const target of t.kind==='jump'?[t.target]:t.kind==='branch'?[t.yes,t.no]:[])predecessors.get(target)?.push(block.id);}
    const entrySets=new Map<number,Set<number>>(),exitSets=new Map<number,Set<number>>();
    // Dead locations are cleared (so a collection does not keep what they
    // last held alive) at the start of every block, where the safepoint is,
    // and before every operation that can reach the runtime. Operations that
    // only move values between slots and globals cannot run a collection or
    // user code, so clearing before them is deferred to the next boundary
    // that needs it; a location rewritten in between is never cleared.
    const inline=(op:Operation):boolean=>{
      if(movesOnly.has(op.kind))return true;
      // Arithmetic, comparisons and updates on proven Numbers are inline.
      if(op.kind==='binary'&&op.numeric&&['+','-','*','/','<','<=','>','>=','==','===','!=','!=='].includes(op.operator))return true;
      return op.kind==='unary'&&!!op.numeric&&['numeric','increment','decrement','-','+'].includes(op.operator);
    };
    // A block of inline operations allocates nothing: it needs no safepoint,
    // and without one nothing has to be cleared at its start either.
    const needsSafepoint=(block:BlockIR):boolean=>!block.operations.every(inline);
    const clearsBefore=(block:BlockIR,index:number):boolean=>index===0?needsSafepoint(block):!inline(block.operations[index]!);
    const exitOf=(block:BlockIR,entry:Set<number>):Set<number>=>{
      let possible=entry;
      for(const [index,op] of block.operations.entries()){
        if(clearsBefore(block,index))possible=new Set(liveness.get(block.id)!.before[index]!);else possible=new Set(possible);
        for(const d of destinations(op))possible.add(d);
      }
      return possible;
    };
    for(let changed=true;changed;){
      changed=false;
      for(const [index,block] of fn.blocks.entries()){
        let entry:Set<number>;
        if(handlerTargets.has(block.id))entry=new Set(allSlots);
        else if(index===0)entry=new Set(Array.from({length:fn.parameterCount},(_,i)=>i));
        else{entry=new Set();for(const pred of predecessors.get(block.id)!)for(const slot of exitSets.get(pred)??[])entry.add(slot);}
        const previous=entrySets.get(block.id);
        if(!previous||previous.size!==entry.size){entrySets.set(block.id,entry);exitSets.set(block.id,exitOf(block,entry));changed=true;}
      }
    }
    for(const block of fn.blocks){
      a.label(fn.id+'.block.'+block.id);
      // After the first safepoint only previously live slots/new destinations need clearing.
      let possible=new Set(entrySets.get(block.id)??allSlots);
      let fused:Extract<Operation,{kind:'binary'}>|undefined;
      for(const [index,op] of block.operations.entries()){
       // A location is cleared when none of the slots sharing it is live.
       const live=liveness.get(block.id)!.before[index]!;
       if(clearsBefore(block,index)){
        const liveLocations=new Set([...live].map(location));
        const dead=[...new Set([...possible].map(location))].filter(l=>!liveLocations.has(l));
        if(dead.length){a.mov('rax',0);for(const l of dead){a.store(stack(valueBase+16*l),'rax');a.store(stack(valueBase+16*l+8),'rax');}}
        possible=new Set(live);
       }else possible=new Set(possible);
       for(const d of destinations(op))possible.add(d);
       // Safepoint at the start of every block (every loop iteration passes
       // one): the check of rt.safepoint inline, so that only a collection
       // costs a call. Every slot is rooted and every dead one cleared at
       // every operation boundary, so any boundary is a valid safepoint; one
       // per block bounds the garbage a block can accumulate by its length.
       // GC stress collects before every operation to catch rooting errors.
       if(options.gcStress)a.call('rt.collect');
       else if(index===0&&needsSafepoint(block)){const noGc=a.unique('noGc');a.load('rax',{rip:'rt.liveBytes'});a.load('r10',{rip:'rt.generatorStackBytes'});a.add('rax','r10');a.load('r10',{rip:'rt.gcThreshold'});a.cmp('rax','r10');a.jcc('b',noGc);a.call('rt.collect');a.label(noGc);}
       switch(op.kind){
        case 'globalObject':copy(value(op.dest),{rip:'rt.globalValue'});break;
        case 'readGlobalProperty':{
          // Prelude code is shared by every program and cannot know which
          // names a script declares, so only user code gets the fast path.
          const prelude=fn.id.startsWith('js.regexpVm.'),notBinding=!prelude&&!globalProperties.some(p=>p.name===op.name);
          pointer('rcx',op.dest);a.lea('rdx',{rip:literal(op.name)});a.mov('r8',(op.allowMissing?1:0)|(notBinding?2:0));a.call('rt.readGlobalProperty');break;
        }
        case 'newFunction':
          (op.captures??[]).forEach((n,i)=>copy(stack(argsBase+16*i),value(n)));
          pointer('rcx',op.dest);a.lea('rdx',{rip:op.target});a.mov('r8',op.captures?.length??0);a.lea('r9',stack(argsBase));a.call(op.method&&!op.classConstructor&&!op.generator||op.arrow||op.async&&!op.generator?'rt.newMethod':'rt.newFunction');
          if(op.classConstructor){a.load('r10',payload(op.dest));a.mov('rax',2);a.store({base:'r10',disp:FunctionLayout.constructable},'rax');}
          if(op.async){
            a.load('r10',payload(op.dest));a.mov('rax',op.generator?3:2);a.store({base:'r10',disp:FunctionLayout.generator},'rax');a.mov('rax',0);a.store({base:'r10',disp:FunctionLayout.constructable},'rax');
            if(op.generator){pointer('rcx',op.dest);a.call('rt.initializeAsyncGeneratorFunction');}
            else{a.lea('rax',{rip:'rt.asyncFunctionPrototype'});a.store({base:'r10',disp:O.prototype},'rax');}
          }
          else if(op.generator){a.load('r10',payload(op.dest));a.mov('rax',1);a.store({base:'r10',disp:FunctionLayout.generator},'rax');a.mov('rax',0);a.store({base:'r10',disp:FunctionLayout.constructable},'rax');pointer('rcx',op.dest);a.call('rt.initializeGeneratorFunction');}
          if(op.strict||op.arrow){a.load('r10',payload(op.dest));a.mov('rax',1);a.store({base:'r10',disp:FunctionLayout.rawThis},'rax');}
          if(op.arrow){
            a.load('r10',payload(op.dest));a.mov('rax',1);a.store({base:'r10',disp:FunctionLayout.arrow},'rax');
            for(const [target,source] of [[FunctionLayout.lexicalThis,thisBase],[FunctionLayout.lexicalNewTarget,newTargetBase]] as const){
              a.load('rax',stack(source));a.store({base:'r10',disp:target},'rax');
              a.load('rax',stack(source+8));a.store({base:'r10',disp:target+8},'rax');
            }
            if(fn.id!=='js.main'){
              a.load('rax',stack(64));a.load('rax',{base:'rax',disp:FunctionLayout.homeObject});a.store({base:'r10',disp:FunctionLayout.homeObject},'rax');
            }
          }
          if(op.homeObject!==undefined){a.load('r10',payload(op.dest));a.load('rax',payload(op.homeObject));a.store({base:'r10',disp:FunctionLayout.homeObject},'rax');}
          if(op.sourceText!==undefined){a.load('r10',payload(op.dest));a.lea('rax',{rip:literal(op.sourceText)});a.store({base:'r10',disp:FunctionLayout.sourceText},'rax');}
          pointer('rcx',op.dest);
          if(op.nameSlot===undefined)a.lea('rdx',{rip:literal(op.name??'')});else a.load('rdx',payload(op.nameSlot));
          a.mov('r8',op.parameterCount??0);a.call('rt.initFunctionMetadata');break;
        case 'defineAccessor':pointer('rcx',op.object);pointer('rdx',op.key);pointer('r8',op.source);a.mov('r9',(op.setter?1:0)|(op.nonEnumerable?2:0));a.call('rt.defineLiteralAccessor');break;
        case 'newCell':pointer('rcx',op.dest);pointer('rdx',op.source);a.call('rt.newCell');break;
        case 'readCell':pointer('rcx',op.dest);pointer('rdx',op.cell);a.call('rt.readCell');break;
        case 'writeCell':pointer('rcx',op.cell);pointer('rdx',op.source);a.call('rt.writeCell');break;
        case 'loadCapture':
          a.load('r10',stack(64));a.load('r10',{base:'r10',disp:FunctionLayout.environment});
          copy(value(op.dest),{base:'r10',disp:E.cells+E.entry*op.index});break;
        case 'pushHandler':{
          const offset=handlerBase+H.size*op.index;
          a.load('rax',{rip:'rt.exceptionHandler'});a.store(stack(offset+H.next),'rax');a.mov('rax','rsp');a.store(stack(offset+H.stack),'rax');
          a.lea('rax',{rip:fn.id+'.block.'+op.target});a.store(stack(offset+H.target),'rax');a.load('rax',{rip:'rt.gcRoots'});a.store(stack(offset+H.roots),'rax');
          a.lea('rax',value(op.error));a.store(stack(offset+H.value),'rax');a.load('rax',{rip:'rt.cleanupHead'});a.store(stack(offset+H.cleanup),'rax');
          preservedGp.forEach((reg,i)=>a.store(stack(offset+H.gp+8*i),reg));preservedXmm.forEach((reg,i)=>a.storeXmm128(stack(offset+H.xmm+16*i),reg));
          a.mov('rax',op.handlerKind==='finally'?1:0);a.store(stack(offset+H.kind),'rax');
          a.lea('rax',stack(offset));a.store({rip:'rt.exceptionHandler'},'rax');break;
        }
        case 'popHandler':a.load('rax',{rip:'rt.exceptionHandler'});a.load('rax',{base:'rax',disp:H.next});a.store({rip:'rt.exceptionHandler'},'rax');break;
        case 'newTarget':copy(value(op.dest),stack(newTargetBase));break;
        case 'superBase':
          a.load('rax',stack(64));a.load('rax',{base:'rax',disp:FunctionLayout.homeObject});a.load('rax',{base:'rax',disp:O.prototype});a.store(payload(op.dest),'rax');
          {const nonnull=a.unique('superBaseObject'),done=a.unique('superBaseDone');a.test('rax','rax');a.jcc('ne',nonnull);a.mov('rax',1);a.jmp(done);a.label(nonnull);a.mov('rax',5);a.label(done);a.store(value(op.dest),'rax');}break;
        case 'superConstructor':
          if(op.func!==undefined)a.load('rax',payload(op.func));else a.load('rax',stack(64));
          a.load('rax',{base:'rax',disp:O.prototype});a.store(payload(op.dest),'rax');
          {const nonnull=a.unique('superConstructorObject'),done=a.unique('superConstructorDone');a.test('rax','rax');a.jcc('ne',nonnull);a.mov('rax',1);a.jmp(done);a.label(nonnull);a.mov('rax',5);a.label(done);a.store(value(op.dest),'rax');}break;
        case 'superReceiver':copy(value(op.dest),stack(superReceiverBase));break;
        case 'setFunctionHomeObject':a.load('r10',payload(op.func));a.load('rax',payload(op.homeObject));a.store({base:'r10',disp:FunctionLayout.homeObject},'rax');break;
        case 'setCurrentThis':if(!fn.derivedConstructor){
          // An arrow's lexical this may be its derived constructor's this cell.
          const direct=a.unique('directSetThis'),done=a.unique('setThisDone');
          a.load('rax',stack(thisBase));a.cmp('rax',CellTag);a.jcc('ne',direct);
          a.load('r10',stack(thisBase+8));a.load('rax',{base:'r10'});a.cmp('rax',255);failIf(a,'ne','rt.throwReferenceError');
          a.lea('rcx',stack(thisBase));pointer('rdx',op.source);a.call('rt.writeCell');a.jmp(done);
          a.label(direct);copy(stack(thisBase),value(op.source));a.label(done);
        }else if(fn.derivedConstructor){
          a.load('r10',stack(thisBase+8));a.load('rax',{base:'r10'});a.cmp('rax',255);failIf(a,'ne','rt.throwReferenceError');
          a.lea('rcx',stack(thisBase));pointer('rdx',op.source);a.call('rt.writeCell');
        }else copy(stack(thisBase),value(op.source));break;
        case 'validateClassHeritage':{
          const done=a.unique('classHeritageDone');a.load('rax',value(op.base));a.cmp('rax',1);a.jcc('e',done);a.cmp('rax',5);failIf(a,'ne','rt.throwTypeError');
          a.load('r10',payload(op.base));a.load('rax',{base:'r10',disp:O.kind});a.cmp('rax',FunctionKind);failIf(a,'ne','rt.throwTypeError');
          a.load('rax',{base:'r10',disp:FunctionLayout.constructable});a.test('rax','rax');failIf(a,'e','rt.throwTypeError');a.label(done);break;
        }
        case 'validateClassPrototype':{
          const done=a.unique('classPrototypeDone');a.load('rax',value(op.prototype));a.cmp('rax',1);a.jcc('e',done);a.cmp('rax',5);failIf(a,'ne','rt.throwTypeError');a.label(done);break;
        }
        case 'superGet':pointer('rcx',op.dest);pointer('rdx',op.object);pointer('r8',op.key);pointer('r9',op.receiver);a.call('rt.superGet');break;
        case 'superSet':pointer('rcx',op.object);pointer('rdx',op.key);pointer('r8',op.receiver);pointer('r9',op.source);a.call('rt.superSet');if(op.strict){a.test('rax','rax');failIf(a,'e','rt.throwTypeError');}break;
        case 'currentFunction':
          a.load('rax',stack(64));a.store(payload(op.dest),'rax');a.mov('rax',5);a.store(value(op.dest),'rax');break;
        case 'currentThis':{
          const direct=a.unique('directThis'),done=a.unique('thisReady');a.load('rax',stack(thisBase));a.cmp('rax',CellTag);a.jcc('ne',direct);
          pointer('rcx',op.dest);a.lea('rdx',stack(thisBase));a.call('rt.readCell');a.jmp(done);
          a.label(direct);copy(value(op.dest),stack(thisBase));a.label(done);
          a.load('rax',value(op.dest));a.cmp('rax',255);failIf(a,'e','rt.throwReferenceError');break;
        }
        case 'newInstance':
          pointer('rcx',op.callee);
          if(op.argumentArray!==undefined){pointer('rdx',op.argumentArray);a.call('rt.validatePromiseExecutorArray');}
          else{if(op.firstArgument!==undefined)pointer('rdx',op.firstArgument);else a.lea('rdx',{rip:'rt.undefinedValue'});a.call('rt.validatePromiseExecutor');}
          pointer('rcx',op.dest);pointer('rdx',op.callee);a.call('rt.newInstance');break;
        case 'newArguments':
          // Bit 62 of the formal count marks an unmapped (non-simple parameter list) object.
          a.mov('rax',BigInt(op.parameters.length)|(op.unmapped?1n<<62n:0n));a.store(stack(argsBase),'rax');a.load('rax',stack(64));a.store(stack(argsBase+8),'rax');
          op.parameters.forEach((n,i)=>copy(stack(argsBase+16+16*i),n<0?{rip:'rt.undefinedValue'}:value(n)));
          pointer('rcx',op.dest);a.load('rdx',stack(48));a.load('r8',stack(56));a.lea('r9',stack(argsBase));a.call('rt.newArguments');break;
        case 'newRestArray':pointer('rcx',op.dest);a.load('rdx',stack(48));a.load('r8',stack(56));a.mov('r9',op.start);a.call('rt.newRestArray');break;
        case 'constructorResult':pointer('rcx',op.dest);pointer('rdx',op.result);pointer('r8',op.instance);a.call('rt.constructorResult');break;
        case 'derivedReturn':{
          const object=a.unique('derivedReturnObject'),receiver=a.unique('derivedReturnReceiver'),done=a.unique('derivedReturnDone');
          a.load('rax',value(op.source));a.cmp('rax',5);a.jcc('e',object);a.cmp('rax',0);a.jcc('e',receiver);
          a.call('rt.throwTypeError');
          a.label(object);copy(value(op.dest),value(op.source));a.jmp(done);
          a.label(receiver);pointer('rcx',op.dest);a.lea('rdx',stack(thisBase));a.call('rt.readCell');
          a.load('rax',value(op.dest));a.cmp('rax',255);failIf(a,'e','rt.throwReferenceError');
          a.label(done);break;
        }
        case 'invoke':{
          op.arguments.forEach((n,i)=>copy(stack(argsBase+16*i),value(n)));
          const general=a.unique('generalCall'),called=a.unique('called');
          if(op.direct){
            // A callee known at compile time (src/ir/calls.ts): if it is a
            // function running that code, call the code directly with the
            // calling convention rt.invoke uses (RCX result, RDX argc, R8 argv,
            // R9 function, then this and new.target Value pointers).
            a.load('rax',value(op.callee));a.cmp('rax',5);a.jcc('ne',general);
            a.load('r9',payload(op.callee));a.load('rax',{base:'r9',disp:O.kind});a.cmp('rax',FunctionKind);a.jcc('ne',general);
            a.load('rax',{base:'r9',disp:FunctionLayout.code});a.lea('r10',{rip:op.direct});a.cmp('rax','r10');a.jcc('ne',general);
            // this: unchanged for strict code; sloppy code gets the global
            // object for undefined/null and an object receiver as is
            // (primitives, which need boxing, take the general path).
            if(op.receiver===undefined)a.lea('rax',{rip:op.directStrict?'rt.undefinedValue':'rt.globalValue'});
            else if(op.directStrict)a.lea('rax',value(op.receiver));
            else{const object=a.unique('objectThis'),ready=a.unique('thisReady');a.load('rax',value(op.receiver));a.cmp('rax',5);a.jcc('e',object);a.cmp('rax',1);a.jcc('a',general);
             a.lea('rax',{rip:'rt.globalValue'});a.jmp(ready);a.label(object);a.lea('rax',value(op.receiver));a.label(ready);}
            a.store(stack(32),'rax');a.lea('rax',{rip:'rt.undefinedValue'});a.store(stack(40),'rax');
            pointer('rcx',op.dest);a.mov('rdx',op.arguments.length);a.lea('r8',stack(argsBase));a.call(op.direct);
            // A tail call made by the callee comes back as a marker (rt.invoke does the same).
            a.load('rax',value(op.dest));a.cmp('rax',TailCallTag);a.jcc('ne',called);pointer('rcx',op.dest);a.call('rt.tailDispatch');a.jmp(called);
          }
          a.label(general);
          if(op.receiver===undefined)a.lea('rax',{rip:'rt.undefinedValue'});else a.lea('rax',value(op.receiver));
          a.store(stack(32),'rax');
          if(op.newTarget===undefined)a.mov('rax',0);else a.lea('rax',value(op.newTarget));
          a.store(stack(40),'rax');
          pointer('rcx',op.dest);pointer('rdx',op.callee);a.mov('r8',op.arguments.length);a.lea('r9',stack(argsBase));a.call(op.tail?'rt.prepareTailCall':op.construct?'rt.invokeConstruct':'rt.invoke');
          a.label(called);break;
        }
        case 'invokeArray':
          a.mov('rax',op.construct?1:0);a.store(stack(32),'rax');
          if(op.newTarget===undefined)a.mov('rax',0);else a.lea('rax',value(op.newTarget));
          a.store(stack(40),'rax');
          pointer('rcx',op.dest);pointer('rdx',op.callee);pointer('r8',op.array);
          if(op.receiver===undefined)a.lea('r9',{rip:'rt.undefinedValue'});else pointer('r9',op.receiver);
          a.call('rt.invokeArray');break;
        case 'yield':pointer('rcx',op.dest);pointer('rdx',op.source);a.call('rt.generatorYield');break;
        case 'await':pointer('rcx',op.dest);pointer('rdx',op.source);a.call('rt.generatorAwait');break;
        case 'yieldDelegated':pointer('rcx',op.dest);pointer('rdx',op.source);pointer('r8',op.mode);a.call(op.value?'rt.generatorYieldDelegatedValue':'rt.generatorYieldDelegated');break;
        case 'generatorInitialSuspend':a.call('rt.generatorInitialSuspend');break;
        case 'requireObject':a.load('rax',value(op.source));a.cmp('rax',5);failIf(a,'ne','rt.throwTypeError');break;
        case 'newObject':pointer('rcx',op.dest);a.mov('rdx',op.array?1:0);a.mov('r8',op.length);if(op.slots){a.mov('r9',Math.min(op.slots,maxInlineSlots));a.call('rt.newObjectSlots');}else a.call('rt.newObject');break;
        case 'forInKeys':pointer('rcx',op.dest);pointer('rdx',op.object);a.call('rt.forInKeys');break;
        case 'forInHas':pointer('rcx',op.dest);pointer('rdx',op.object);pointer('r8',op.key);a.call('rt.forInHas');break;
        case 'getIterator':pointer('rcx',op.iterator);pointer('rdx',op.next);pointer('r8',op.object);a.call('rt.getIterator');break;
        case 'iteratorStep':pointer('rcx',op.dest);pointer('rdx',op.done);pointer('r8',op.iterator);pointer('r9',op.next);a.call('rt.iteratorStep');break;
        case 'iteratorClose':pointer('rcx',op.iterator);a.call('rt.iteratorClose');break;
        case 'requireIterable':pointer('rcx',op.object);a.call('rt.requireIterable');break;
        case 'forOfValue':pointer('rcx',op.dest);pointer('rdx',op.iterable);pointer('r8',op.index);a.call('rt.forOfValue');break;
        case 'property':
          pointer('rcx',op.dest);pointer('rdx',op.object);pointer('r8',op.key);
          // `object.name` reads go through a per-site inline cache (see
          // property-cache.ts) when the name can only be a named property.
          if(op.operation==='get'&&op.keyName!==undefined&&cacheableName(op.keyName)){
            const cache='ic.'+fragments.length;fragments.push({name:cache,section:'.data',alignment:8,bytes:new Uint8Array(PropertyCacheLayout.size),fixups:[],symbols:{}});
            a.lea('r9',{rip:cache});a.call('rt.getPropertyCached');break;
          }
          a.call('rt.'+op.operation+'Property');if(op.strict&&op.operation==='delete'){a.load('rax',payload(op.dest));a.test('rax','rax');failIf(a,'e','rt.throwTypeError');}break;
        case 'setProperty':pointer('rcx',op.object);pointer('rdx',op.key);pointer('r8',op.source);a.mov('r9',(op.define?1:0)|(op.strict?2:0));a.call('rt.setProperty');break;
        case 'privateGet':pointer('rcx',op.dest);pointer('rdx',op.object);pointer('r8',op.name);a.call('rt.privateGet');break;
        case 'privateSet':pointer('rcx',op.object);pointer('rdx',op.name);pointer('r8',op.source);a.call('rt.privateSet');break;
        case 'defineField':pointer('rcx',op.object);pointer('rdx',op.key);pointer('r8',op.source);a.call('rt.defineField');break;
        case 'defineDataProperty':pointer('rcx',op.object);pointer('rdx',op.key);pointer('r8',op.source);a.mov('r9',op.attributes);a.call('rt.initFunctionProperty');break;
        case 'setPrototype':pointer('rcx',op.object);pointer('rdx',op.prototype);a.call('rt.setPrototype');break;
        case 'uninitialized':
          a.mov('rax',255);a.store(value(op.dest),'rax');a.mov('rax',0);a.store(payload(op.dest),'rax');break;
        case 'checkInitialized':a.load('rax',value(op.slot));a.cmp('rax',255);failIf(a,'e','rt.throwReferenceError');break;
        case 'checkResolvable':a.load('rax',payload(op.slot));a.test('rax','rax');failIf(a,'e','rt.throwReferenceError');break;
        case 'immutableWrite':a.call('rt.throw'+(op.error??'TypeError'));break;
        case 'constant':{
          const v=op.value,tag=v===undefined?0:v===null?1:typeof v==='boolean'?2:typeof v==='number'?3:typeof v==='bigint'?7:4;
          a.mov('rax',tag);a.store(value(op.dest),'rax');
          if(typeof v==='string'||typeof v==='bigint')a.lea('rax',{rip:literal(String(v))});
          else if(typeof v==='number'){const bytes=new DataView(new ArrayBuffer(8));bytes.setFloat64(0,v,true);a.mov('rax',bytes.getBigUint64(0,true));}
          else a.mov('rax',v===true?1:0);
          a.store(payload(op.dest),'rax');break;
        }
        case 'copy':copy(value(op.dest),value(op.source));break;
        case 'loadGlobal':copy(value(op.dest),{rip:op.prelude?'rt.preludeGlobals':'js.globals',addend:16*op.index});break;
        case 'storeGlobal':{
          if(op.prelude){copy({rip:'rt.preludeGlobals',addend:16*op.index},value(op.source));break;}
          const alias=globalProperties.findIndex(p=>p.index===op.index),done=a.unique('globalStoreDone');
          if(alias>=0){a.load('rax',{rip:'js.globalBindings',addend:alias*24+16});a.and('rax',1);a.test('rax','rax');if(op.strict)failIf(a,'e','rt.throwTypeError');else a.jcc('e',done);}
          copy({rip:'js.globals',addend:16*op.index},value(op.source));a.label(done);break;
        }
        case 'unary':
          if(op.operator==='isReturnMarker'){
            // generator.return() unwinds with a CellTag marker value (rt.generatorYield).
            a.load('rax',value(op.argument));a.cmp('rax',254);a.emit([0x0f,0x94,0xc0]);a.emit([0x48,0x0f,0xb6,0xc0]);// sete al; movzx rax,al
            a.store(payload(op.dest),'rax');a.mov('r10',2);a.store(value(op.dest),'r10');break;
          }
          if(op.numeric&&emitKnownNumberUnary(op.dest,op.operator,op.argument))break;
          if(emitNumberUnary(op.dest,op.operator,op.argument))break;
          pointer('rcx',op.dest);pointer('rdx',op.argument);a.call('rt.'+unary[op.operator]);break;
        case 'binary':{
          // A comparison of Numbers that only decides this block's branch is
          // fused into it: no boolean is materialized.
          if(op.numeric&&op.operator in knownRelation&&index===block.operations.length-1&&block.terminator.kind==='branch'&&block.terminator.condition===op.dest&&!liveness.get(block.id)!.liveOut.has(op.dest)){fused=op;break;}
          if(op.numeric&&emitKnownNumberBinary(op.dest,op.operator,op.left,op.right))break;
          const done=emitNumberBinary(op.dest,op.operator,op.left,op.right);
          // Strict equality of non-Numbers decides inline unless both sides
          // are strings with different records or BigInts: different types
          // are unequal, undefined and null equal themselves, booleans
          // compare by truth, objects and symbols by identity.
          if((op.operator==='==='||op.operator==='!==')&&done){
            const generic=a.unique('strictGeneric'),yes=a.unique('strictYes'),no=a.unique('strictNo'),store=a.unique('strictStore'),bool=a.unique('strictBool'),identity=a.unique('strictIdentity');
            a.load('rax',value(op.left));a.load('r10',value(op.right));a.cmp('rax','r10');a.jcc('ne',no);
            a.cmp('rax',1);a.jcc('be',yes);a.cmp('rax',2);a.jcc('e',bool);a.cmp('rax',5);a.jcc('e',identity);a.cmp('rax',6);a.jcc('e',identity);
            a.cmp('rax',4);a.jcc('ne',generic);a.load('rax',payload(op.left));a.load('r10',payload(op.right));a.cmp('rax','r10');a.jcc('e',yes);a.jmp(generic);
            a.label(identity);a.load('rax',payload(op.left));a.load('r10',payload(op.right));a.cmp('rax','r10');a.jcc('e',yes);a.jmp(no);
            a.label(bool);a.load('rax',payload(op.left));a.load('r10',payload(op.right));a.test('rax','rax');a.jcc('e','strictLeftFalse'+bool);a.test('r10','r10');a.jcc('ne',yes);a.jmp(no);
            a.label('strictLeftFalse'+bool);a.test('r10','r10');a.jcc('e',yes);
            a.label(no);a.mov('rax',op.operator==='!=='?1:0);a.jmp(store);
            a.label(yes);a.mov('rax',op.operator==='!=='?0:1);
            a.label(store);setBoolean(op.dest);a.jmp(done);
            a.label(generic);
          }
          pointer('rcx',op.dest);pointer('rdx',op.left);pointer('r8',op.right);a.call('rt.'+binary[op.operator]);
          if(op.operator==='!='||op.operator==='!=='){a.load('rax',payload(op.dest));a.xor('rax',1);a.store(payload(op.dest),'rax');}
          if(done)a.label(done);break;
        }
        case 'call':
          op.arguments.forEach((n,i)=>copy(stack(argsBase+16*i),value(n)));
          pointer('rcx',op.dest);a.mov('rdx',op.arguments.length);a.lea('r8',stack(argsBase));a.call(op.target);break;
       }
      }
      const term=block.terminator;
      switch(term.kind){
        case 'jump':a.jmp(fn.id+'.block.'+term.target);break;
        case 'branch':{
          if(fused){
            // ucomisd: unordered (NaN) sets parity; only != holds then.
            const yes=fn.id+'.block.'+term.yes,no=fn.id+'.block.'+term.no,negated=fused.operator==='!='||fused.operator==='!==';
            a.movsd('xmm0',payload(fused.left));a.ucomisd('xmm0',payload(fused.right));
            if(negated){a.jcc('p',yes);a.jcc('e',no);a.jmp(yes);}else{a.jcc('p',no);a.jcc(knownRelation[fused.operator]!,yes);a.jmp(no);}
            break;
          }
          // Booleans (the result of every comparison) and numbers decide inline;
          // the other tags go through rt.toBoolean.
          const slow=a.unique('branchSlow'),test=a.unique('branchTest'),yes=fn.id+'.block.'+term.yes,no=fn.id+'.block.'+term.no;
          a.load('rax',value(term.condition));a.load('r10',payload(term.condition));a.cmp('rax',2);a.jcc('e',test);a.cmp('rax',3);a.jcc('ne',slow);
          a.movqToXmm('xmm0','r10');a.xor('rax','rax');a.movqToXmm('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc('p',no);a.jcc('e',no);a.jmp(yes);
          a.label(slow);pointer('rcx',term.condition);a.call('rt.toBoolean');a.mov('r10','rax');
          a.label(test);a.test('r10','r10');a.jcc('ne',yes);a.jmp(no);break;
        }
        case 'throw':pointer('rcx',term.value);a.call('rt.throw');break;
        case 'return':
          a.load('r10',stack(72));
          if(term.value<0){a.mov('rax',0);a.store({base:'r10'},'rax');a.store({base:'r10',disp:8},'rax');}
          else copy({base:'r10'},value(term.value));
          a.load('rax',stack(rootBase+R.next));a.store({rip:'rt.gcRoots'},'rax');
          a.add('rsp',allocation);a.ret();break;
      }
    }
    finish(a,fn.id,allocation,prologSize);
  }
  module.functions.forEach(fn=>emitFunction(fn));
  // Host functions installed as properties of the global object before the prelude.
  const hostGlobals:string[]=[];
  const hostGlobal=(name:string,code:string,length:number):void=>{
    const base='host.'+name;
    fragments.push(stringLiteral(base+'.key',name),stringLiteral(base+'.source',`function ${name}() { [native code] }`));
    const callable=new Uint8Array(FunctionLayout.size);callable[O.kind]=FunctionKind;callable[FunctionLayout.rawThis]=1;
    const lengthProperty=new Uint8Array(P.size);lengthProperty[P.value]=3;lengthProperty[P.attributes]=A.configurable;new DataView(lengthProperty.buffer).setFloat64(P.value+8,length,true);
    fragments.push({name:base+'.length',section:'.data',alignment:8,bytes:lengthProperty,symbols:{},fixups:[{offset:P.key,kind:'va64',target:'rt.str.length',addend:0}]});
    const nameProperty=new Uint8Array(P.size);nameProperty[P.value]=4;nameProperty[P.attributes]=A.configurable;
    fragments.push({name:base+'.name',section:'.data',alignment:8,bytes:nameProperty,symbols:{},fixups:[
      {offset:P.next,kind:'va64',target:base+'.length',addend:0},{offset:P.key,kind:'va64',target:'rt.str.name',addend:0},{offset:P.value+8,kind:'va64',target:base+'.key',addend:0}]});
    fragments.push({name:base+'.fn',section:'.data',alignment:8,bytes:callable,symbols:{},fixups:[
      {offset:O.properties,kind:'va64',target:base+'.name',addend:0},
      {offset:O.prototype,kind:'va64',target:'rt.functionPrototype',addend:0},
      {offset:FunctionLayout.code,kind:'va64',target:code,addend:0},
      {offset:FunctionLayout.sourceText,kind:'va64',target:base+'.source',addend:0},
    ]});
    const keyValue=new Uint8Array(16);keyValue[0]=4;const fnValue=new Uint8Array(16);fnValue[0]=5;
    fragments.push({name:base+'.keyValue',section:'.rdata',alignment:8,bytes:keyValue,symbols:{},fixups:[{offset:8,kind:'va64',target:base+'.key',addend:0}]});
    fragments.push({name:base+'.fnValue',section:'.rdata',alignment:8,bytes:fnValue,symbols:{},fixups:[{offset:8,kind:'va64',target:base+'.fn',addend:0}]});
    hostGlobals.push(base);
  };
  // Host functions for the process prelude are FFI thunks for the target:
  // KERNEL32 exports on Windows, system calls on Linux.
  // Both targets' declarations are compiled into every image, so one program
  // can be linked as PE and ELF; each linker binds the other target's imports
  // to an "unavailable" stub (see emitFfi, linkPe and the Linux shims).
  const hostFfi=hasPrelude&&linked.includes('process')?[...processHostDeclarations('win32-x64'),...processHostDeclarations('linux-x64')]:[];
  if(module.ffi?.length||hostFfi.length){
    const ffi=emitFfi(module.ffi??[]).bundle;
    fragments.push(...ffi.fragments);functions.push(...ffi.functions);runtime.imports.push(...ffi.imports);
    if(module.ffi?.length)hostGlobal('__nonaFfiLastError','rt.ffiLastError.code',0);
    const host=emitFfi(hostFfi.map(h=>h.declaration),{prefix:'hostffi',support:false}).bundle;
    fragments.push(...host.fragments);functions.push(...host.functions);runtime.imports.push(...host.imports);
    hostFfi.forEach((h,index)=>hostGlobal('__nonaHost_'+h.name,'hostffi.'+index+'.code',0));
  }
  if(hasPrelude&&linked.includes('timers')){
    // Event-loop primitives, captured and removed from the global object by the timer prelude.
    hostGlobal('__nonaHostNow','rt.hostNow.code',0);
    hostGlobal('__nonaHostWait','rt.agentSleep.code',1);
  }
  if(hasPrelude&&linked.includes('encoding')){
    // UTF-8 transcoding, captured and removed from the global object by the encoding prelude.
    hostGlobal('__nonaUtf8Encode','rt.utf8Encode.code',2);
    hostGlobal('__nonaUtf8Decode','rt.utf8Decode.code',3);
  }
  if(hasPrelude&&linked.includes('network')){
    // Captured and removed from the global object by nona:internal/native.
    hostGlobal('__nonaNetParse','rt.netParse.code',4);
    hostGlobal('__nonaNetLatin1','rt.netLatin1.code',3);
    hostGlobal('__nonaNetWrite','rt.netWrite.code',4);
    hostGlobal('__nonaNetCopy','rt.netCopy.code',5);
    hostGlobal('__nonaNetCheck','rt.netCheck.code',2);
  }
  const agentPrograms=options.agentPrograms??[];
  if(options.agent){
    hostGlobal('__nonaAgentReceiveBroadcast','rt.agentReceiveBroadcast.code',1);
    hostGlobal('__nonaAgentReport','rt.agentReport.code',1);
    hostGlobal('__nonaAgentSleep','rt.agentSleep.code',1);
  }
  if(agentPrograms.length){
    hostGlobal('__nonaAgentStart','rt.agentStart.code',1);
    hostGlobal('__nonaAgentBroadcast','rt.agentBroadcast.code',2);
    hostGlobal('__nonaAgentGetReport','rt.agentGetReport.code',0);
    hostGlobal('__nonaAgentSleep','rt.agentSleep.code',1);
  }
  if(realms>0){
    // realm.createRealm(): initialize the next cloned realm and return its global.
    hostGlobal('__nonaCreateRealm','realm.createRealm.code',0);
    fragments.push({name:'realm.count',section:'.data',alignment:8,bytes:new Uint8Array(8),fixups:[],symbols:{}});
    const a=new Assembler('realm.createRealm.code'),size=88;a.sub('rsp',size);const prolog=a.offset;
    a.store(stack(72),'rcx');
    a.load('rax',{rip:'realm.count'});a.add('rax',1);a.cmp('rax',realms);failIf(a,'a','rt.throwRangeError');a.store({rip:'realm.count'},'rax');
    const done=a.unique('done');
    for(let realm=1;realm<=realms;realm++){
      const next=a.unique('next');a.load('rax',{rip:'realm.count'});a.cmp('rax',realm);a.jcc('ne',next);
      const r=(name:string)=>realmSymbol(realm,name);
      a.lea('rax',{rip:r('js.globals')});a.store({rip:r('rt.gcGlobals')},'rax');
      a.mov('rax',module.globalCount);a.store({rip:r('rt.gcGlobalCount')},'rax');
      a.lea('rax',{rip:r('js.globalBindings')});a.store({rip:r('rt.globalBindings')},'rax');
      a.mov('rax',0);a.store({rip:r('rt.globalBindingCount')},'rax');
      a.mov('rax',1);a.store({rip:r('rt.realmReady')},'rax');
      a.lea('rax',{rip:r('rt.globalValue')});a.store(stack(32),'rax');
      a.lea('rax',{rip:'rt.undefinedValue'});a.store(stack(40),'rax');
      a.lea('rcx',stack(48));a.mov('rdx',0);a.lea('r8',stack(48));a.mov('r9',0);a.call(r('js.regexpVm.main'));
      a.load('rcx',stack(72));for(const offset of [0,8]){a.load('rax',{rip:r('rt.globalValue'),addend:offset});a.store({base:'rcx',disp:offset},'rax');}
      a.jmp(done);a.label(next);
    }
    a.label(done);a.add('rsp',size);a.ret();finish(a,'realm.createRealm.code',size,prolog);
    cloneRealms(fragments,functions,realms,FunctionLayout.size,FunctionLayout.realm);
  }
  // Thread entries of the linked agent programs.
  const countFragment=fragments.find(f=>f.name==='agent.entryCount')!,entriesFragment=fragments.find(f=>f.name==='agent.entries')!;
  new DataView(countFragment.bytes.buffer).setBigUint64(0,BigInt(agentPrograms.length),true);
  entriesFragment.bytes=new Uint8Array(Math.max(8,8*agentPrograms.length));
  entriesFragment.fixups=agentPrograms.map((_,agent)=>({offset:8*agent,kind:'va64' as const,target:agentSymbol(agent,'entry'),addend:0}));
  mergeAgentPrograms(fragments,functions,runtime.imports,agentPrograms);
  const entry=new Assembler('entry');entry.sub('rsp',72);const p=entry.offset;
  entry.lea('rax',{base:'rsp',disp:-StackBudget.main});entry.store({rip:'rt.stackLimit'},'rax');
  entry.call('rt.init');
  // GC stress: freed cells are poisoned so a missing root fails at once.
  if(options.gcStress){entry.mov('rax',1);entry.store({rip:'rt.gcPoison'},'rax');}
  entry.lea('rax',{rip:'js.globals'});entry.store({rip:'rt.gcGlobals'},'rax');
  entry.mov('rax',module.globalCount);entry.store({rip:'rt.gcGlobalCount'},'rax');
  entry.lea('rax',{rip:'js.globalBindings'});entry.store({rip:'rt.globalBindings'},'rax');
  entry.mov('rax',globalProperties.length);entry.store({rip:'rt.globalBindingCount'},'rax');
  for(const base of hostGlobals){
    entry.lea('rcx',{rip:'rt.globalValue'});entry.lea('rdx',{rip:base+'.keyValue'});entry.lea('r8',{rip:base+'.fnValue'});
    entry.mov('r9',A.writable|A.configurable);entry.call('rt.setProperty');
  }
  const callArguments=()=>{
    entry.lea('rax',{rip:'rt.globalValue'});entry.store(stack(32),'rax');entry.lea('rax',{rip:'rt.undefinedValue'});entry.store(stack(40),'rax');
    entry.lea('rcx',stack(48));entry.mov('rdx',0);entry.lea('r8',stack(48));entry.mov('r9',0);
  };
  const drain=()=>{
    entry.lea('rcx',stack(48));entry.lea('rdx',{rip:'rt.preludeGlobals'});entry.add('rdx',16);
    entry.mov('r8',0);entry.lea('r9',stack(48));entry.call('rt.invoke');
  };
  callArguments();
  if(hasPrelude){entry.call('js.regexpVm.main');callArguments();}
  entry.call('js.main');
  if(hasPrelude)drain();
  if(options.agent){
    // An agent thread handles one broadcast, runs its jobs and returns.
    entry.call('rt.agentAwaitBroadcast');if(hasPrelude)drain();
    entry.mov('rax',0);entry.add('rsp',72);entry.ret();finish(entry,'entry',72,p);
  }else{
    if(options.callStats)entry.call('rt.callStatsReport');entry.call('rt.runExitHook');entry.call('rt.dispose');entry.mov('rcx',0);entry.callImport('ExitProcess');entry.add('rsp',72);entry.ret();finish(entry,'entry',72,p);
  }
  return {fragments,imports:runtime.imports,entry:'entry',functions};
}
