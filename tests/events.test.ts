import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { eventsModuleSource } from "../src/runtime/events-module-source.js";
import { compile } from "../src/compiler.js";
import { runModulesOnHost } from "./helpers/host.js";
import { requireHostTarget } from "../src/target.js";
import {
    timeoutImports,
    timeoutContracts,
} from "./helpers/abort-timeout-fixture.js";

const cases: [string, string][] = [
    [
        "timeout signals do not keep the process alive",
        `
AbortSignal.timeout(1000).addEventListener('abort',()=>console.log('unexpected'));console.log('done');
`,
    ],
    [
        "listener ordering, symbols, receiver and mutation",
        `
const e=new EventEmitter(), key=Symbol('key'), out=[];
function a(x){out.push('a'+x+':'+(this===e));e.off(key,b);e.on(key,()=>out.push('late'));}
function b(x){out.push('b'+x);}
e.on(key,a).on(key,b).prependOnceListener(key,x=>out.push('first'+x));
console.log(e.listeners(key).length,e.rawListeners(key)[0].listener===e.listeners(key)[0]);
console.log(e.emit(key,1),e.emit(key,2),e.emit('none'),out.join('|'));
console.log(e.eventNames().map(String).join(),e.listenerCount(key));
`,
    ],
    [
        "once and prependOnceListener go through overridden on and prependListener",
        `
class Flow extends EventEmitter{
 constructor(){super();this.seen=[];this.flowing=false;}
 on(n,f){const r=super.on(n,f);this.seen.push('on:'+String(n));if(n==='data'&&!this.flowing){this.flowing=true;Promise.resolve().then(()=>this.emit('data',1));}return r;}
 prependListener(n,f){this.seen.push('prepend:'+String(n));return super.prependListener(n,f);}
}
const e=new Flow(),key=Symbol('k');
console.log(e.once('data',x=>console.log('data',x,e.listenerCount('data')))===e);
e.prependOnceListener(key,x=>console.log('key',x));e.emit(key,2);e.emit(key,3);
console.log(e.seen.join('|'),e.listenerCount(key));
`,
    ],
    [
        "emitter methods mixed into a function, an object and called on plain objects",
        `
const copy=t=>{for(const k of Object.getOwnPropertyNames(EventEmitter.prototype))Object.defineProperty(t,k,Object.getOwnPropertyDescriptor(EventEmitter.prototype,k));return t;};
const f=copy(function app(){}), o=copy({}), out=[];
for(const t of [f,o]){
const h=x=>out.push('h'+x);
console.log(t.on('x',h)===t,t.once('x',x=>out.push('o'+x))===t,t.emit('x',1),t.emit('x',2),out.join());
console.log(t.listenerCount('x'),t.eventNames().join(),t.getMaxListeners(),t.removeListener('x',h)===t,t.emit('x',3),t.listeners('x').length);
console.log(t.removeAllListeners()===t,t.eventNames().length,t.emit('nothing'));
try{t.emit('error',new Error('boom'));}catch(e){console.log(e.message);}
out.length=0;
}
const p={},call=EventEmitter.prototype;
console.log(call.on.call(p,'a',()=>out.push('a'))===p,call.prependListener.call(p,'a',()=>out.push('b'))===p,call.emit.call(p,'a'),out.join(),call.listenerCount.call(p,'a'),call.listeners.call(p,'a').length,call.rawListeners.call(p,'a').length,call.eventNames.call(p).join());
console.log(call.removeAllListeners.call({},'a') !== undefined,call.listenerCount.call({},'zz'),call.emit.call({},'zz'));
`,
    ],
    [
        "meta events, duplicate removal and snapshots",
        `
const e=new EventEmitter(),out=[];
e.on('newListener',(n,f)=>out.push('add:'+String(n)+':'+f.name));
e.on('removeListener',(n,f)=>out.push('remove:'+String(n)+':'+f.name));
function fn(){} e.on('x',fn).once('x',fn).prependListener('x',fn);
const raw=e.rawListeners('x');console.log(e.listenerCount('x',fn),raw.length,raw[2].listener===fn);
e.removeListener('x',fn);console.log(e.listenerCount('x',fn),raw.length);
e.removeAllListeners('x');console.log(out.join('|'));e.removeAllListeners();console.log(e.eventNames().length);
`,
    ],
    [
        "recursive once and wrapper direct invocation",
        `
const e=new EventEmitter();let n=0;
function f(){n++;e.emit('x');return 42;}e.once('x',f);
const wrap=e.rawListeners('x')[0];console.log(wrap.listener===f,wrap(),wrap(),n,e.listenerCount('x'));
`,
    ],
    [
        "errors and errorMonitor",
        `
const e=new EventEmitter(),err=new Error('boom');e.on(errorMonitor,x=>console.log('monitor',x===err));
try{e.emit('error',err)}catch(x){console.log('same',x===err)}
e.on('error',x=>console.log('handled',x===err));console.log(e.emit('error',err));
try{new EventEmitter().emit('error','oops')}catch(x){console.log(x.code,x.context)}
`,
    ],
    [
        "max listeners and aliases",
        `
const a=new EventEmitter(),b=new EventEmitter();
console.log(EventEmitter===Default,EventEmitter.EventEmitter===EventEmitter,a.on===a.addListener,a.off===a.removeListener);
console.log(getMaxListeners(a),defaultMaxListeners);setMaxListeners(2,a,b);console.log(a.getMaxListeners(),b.getMaxListeners());
EventEmitter.defaultMaxListeners=4;console.log(new EventEmitter().getMaxListeners());EventEmitter.defaultMaxListeners=10;
for(const n of [-1,NaN,'x']){try{a.setMaxListeners(n)}catch(x){console.log(x.name,x.code)}}
for(const f of [null,1,{}]){try{a.on('x',f)}catch(x){console.log(x.name,x.code)}}
function f(){}a.on('x',f);console.log(listenerCount(a,'x'),getEventListeners(a,'x')[0]===f);
`,
    ],
    [
        "promise once cleanup and error rejection",
        `
const e=new EventEmitter();const p=once(e,'x');console.log(e.listenerCount('x'),e.listenerCount('error'));
p.then(x=>console.log('once',x.join(','),e.listenerCount('x'),e.listenerCount('error')));e.emit('x',1,2);
const q=once(e,'y');q.catch(x=>console.log('reject',x.message,e.listenerCount('y')));e.emit('error',new Error('bad'));
`,
    ],
    [
        "async iterator queue and close",
        `
const e=new EventEmitter();const it=on(e,'x',{close:['close']});e.emit('x',1,2);e.emit('x',3);e.emit('close');
async function run(){for await(const values of it)console.log(values.join(','));console.log('end',e.eventNames().length);}
run();
`,
    ],
    [
        "capture rejections and custom hook",
        `
const a=new EventEmitter({captureRejections:true});a.on('error',x=>console.log('caught',x.message));a.on('x',()=>Promise.reject(new Error('bad')));a.emit('x');
const b=new EventEmitter({captureRejections:true});b[captureRejectionSymbol]=function(err,name,arg){console.log('hook',err.message,name,arg,this===b)};b.on('x',()=>Promise.reject(new Error('hooked')));b.emit('x',7);
`,
    ],
    [
        "subclasses, inherited emitters, property keys and global capture",
        `
class Child extends EventEmitter{}const a=new Child();console.log(a instanceof EventEmitter,a instanceof Child);
const b=Object.create(EventEmitter.prototype);b.on('x',()=>console.log('b'));console.log(a.listenerCount('x'));b.emit('x');
a.on('__proto__',()=>console.log('proto')).on(5,()=>console.log('five'));a.emit('__proto__');a.emit('5');console.log(a.eventNames().map(String).join('|'));
EventEmitter.captureRejections=true;const c=new EventEmitter();EventEmitter.captureRejections=false;c.on('error',e=>console.log(e.message));c.on('x',()=>Promise.reject(new Error('global')));c.emit('x');
`,
    ],
    [
        "iterator watermarks and cleanup",
        `
const e=new EventEmitter();e.pause=()=>console.log('pause');e.resume=()=>console.log('resume');const it=on(e,'x',{highWaterMark:1,lowWaterMark:1});e.emit('x',1);e.emit('x',2);
async function run(){console.log((await it.next()).value.join());console.log((await it.next()).value.join());await it.return();console.log(e.eventNames().length);}
run();
`,
    ],
    [
        "abortable helpers with a supplied signal",
        `
class Signal{constructor(){this.aborted=false;this.reason='reason';this.handlers=[];}addEventListener(n,f){this.handlers.push(f);}removeEventListener(n,f){this.handlers=this.handlers.filter(x=>x!==f);}abort(){this.aborted=true;for(const f of this.handlers.slice())f();}}
const e=new EventEmitter(),signal=new Signal();once(e,'x',{signal}).catch(x=>console.log(x.name,x.code,x.cause,e.eventNames().length));signal.abort();
`,
    ],
    [
        "listener limit warnings are reported once per listener array",
        `
const original=process.emitWarning;process.emitWarning=w=>console.log(w.name,w.count,w.type,w.emitter===e);
const e=new EventEmitter().setMaxListeners(1);const f=()=>{};e.on('x',f).on('x',f).on('x',f);e.removeAllListeners('x');e.on('x',f).on('x',f);process.emitWarning=original;
`,
    ],
    [
        "constructor options, default helper limits and watermark validation",
        `
for(const options of [undefined,null,false,1,'x',{}])console.log(new EventEmitter(options).getMaxListeners());
console.log(setMaxListeners());
for(const n of [0,-1,NaN,'x',1.1]){try{on(new EventEmitter(),'x',{highWaterMark:n})}catch(e){console.log(e.name,e.code)}}
for(const n of [0,-1,NaN,'x',1.1]){try{on(new EventEmitter(),'x',{lowWaterMark:n})}catch(e){console.log(e.name,e.code)}}
for(const key of ['highWatermark','lowWatermark']){try{on(new EventEmitter(),'x',{[key]:0})}catch(e){console.log(key,e.code)}}
`,
    ],
    [
        "iterator pending requests, return and errors",
        `
async function run(){const e=new EventEmitter(),it=on(e,'x');const p=it.next();e.emit('x',9);console.log((await p).value.join());await it.return();console.log((await it.next()).done,e.eventNames().length);
const jt=on(e,'y');e.emit('y',1);e.emit('error',new Error('bad'));console.log((await jt.next()).value.join());try{await jt.next()}catch(x){console.log(x.message)}console.log((await jt.next()).done);}
run();
`,
    ],
    [
        "unhandled error message inspects the value",
        `
for(const args of [[{code:42}],['str'],[],["it's"],[[1,'a']],[null],[{a:{b:{c:{d:1}}},'x-y':1n}],[Symbol('s')]]){
try{new EventEmitter().emit('error',...args)}catch(e){console.log(e.message,e.code,e.context===args[0])}}
`,
    ],
];
const imports = `import Default,{EventEmitter,errorMonitor,captureRejectionSymbol,defaultMaxListeners,once,on,getEventListeners,getMaxListeners,setMaxListeners,listenerCount} from 'node:events';\n`;
for (const [name, body] of cases) {
    test(
        "events native oracle: " + name,
        {
            skip:
                name.startsWith("listener limit warnings") &&
                process.platform !== "win32" &&
                process.platform !== "linux",
        },
        () => {
            const { native, oracle } = runModulesOnHost(
                { "main.mjs": imports + body },
                "main.mjs",
                { gcStress: !name.startsWith("listener limit warnings") },
            );
            assert.equal(native.error, undefined);
            assert.equal(native.status, 0, native.stderr);
            assert.equal(native.stdout, oracle);
        },
    );
}

// The explicit contracts run through all three paths, with and without GC.
// Host timing/GC experiments belong to Actions; the source tests use a fake clock.
for (const { name, body, expected } of timeoutContracts)
    for (const gcStress of [false, true])
        for (const path of ["ir", "default", "full"] as const) {
            test(`events timeout phase: ${name} (${path}, gcStress=${gcStress})`, () => {
                assert.equal(
                    process.env.GITHUB_ACTIONS,
                    "true",
                    "hosted timing experiment only",
                );
                assert.equal(process.env.RUNNER_ENVIRONMENT, "github-hosted");
                assert.notEqual(
                    process.env.NONA_GC_STRESS,
                    "off",
                    "must not silently disable the GC-on controls",
                );
                const source = timeoutImports + body;
                const outputRoot = join(process.cwd(), "work", "abort-timeout");
                mkdirSync(outputRoot, { recursive: true });
                const directory = mkdtempSync(
                    join(outputRoot, `${name}-${path}-gc${gcStress}-`),
                );
                const retain = (file: string, value: unknown) =>
                    writeFileSync(
                        join(directory, file),
                        JSON.stringify(value, null, 2) + "\n",
                    );
                writeFileSync(join(directory, "main.mjs"), source);
                retain("metadata.json", {
                    name,
                    path,
                    gcStress,
                    expected,
                    sourceSha256: createHash("sha256")
                        .update(source)
                        .digest("hex"),
                    revision: process.env.GITHUB_SHA,
                    node: process.version,
                    platform: process.platform,
                    arch: process.arch,
                });
                if (path === "ir") {
                    const { native, oracle, oracleStatus } = runModulesOnHost(
                        { "main.mjs": source },
                        "main.mjs",
                        { gcStress },
                    );
                    retain("results.json", { native, oracle, oracleStatus });
                    assert.equal(oracleStatus, 0);
                    assert.equal(oracle, expected);
                    assert.equal(native.error, undefined);
                    assert.equal(native.status, 0, native.stderr);
                    assert.equal(native.stderr, "");
                    assert.equal(native.stdout, expected);
                    return;
                }
                try {
                    const entry = join(directory, "main.mjs");
                    writeFileSync(entry, source);
                    const oracle = spawnSync(process.execPath, [entry], {
                        encoding: "utf8",
                        timeout: 10000,
                        windowsHide: true,
                        cwd: directory,
                    });
                    retain("oracle.json", {
                        status: oracle.status,
                        signal: oracle.signal,
                        error: oracle.error?.message ?? null,
                        stdout: oracle.stdout,
                        stderr: oracle.stderr,
                    });
                    assert.equal(oracle.error, undefined);
                    assert.equal(oracle.status, 0, oracle.stderr);
                    assert.equal(oracle.stderr, "");
                    assert.equal(oracle.stdout, expected);
                    const compiled = compile(source, {
                        fileName: entry,
                        target: requireHostTarget(),
                        module: true,
                        gcStress,
                        fullRuntime: path === "full",
                    });
                    retain(
                        "compile.json",
                        compiled.ok
                            ? {
                                  ok: true,
                                  imageSha256: createHash("sha256")
                                      .update(compiled.image)
                                      .digest("hex"),
                              }
                            : compiled,
                    );
                    assert.ok(
                        compiled.ok,
                        compiled.ok ? "" : JSON.stringify(compiled.diagnostics),
                    );
                    const executable = join(
                        directory,
                        process.platform === "win32" ? "image.exe" : "image",
                    );
                    writeFileSync(executable, compiled.image);
                    chmodSync(executable, 0o755);
                    const native = spawnSync(executable, [], {
                        encoding: "utf8",
                        timeout: 180000,
                        windowsHide: true,
                        cwd: directory,
                    });
                    retain("native.json", {
                        status: native.status,
                        signal: native.signal,
                        error: native.error?.message ?? null,
                        stdout: native.stdout,
                        stderr: native.stderr,
                    });
                    assert.equal(native.error, undefined);
                    assert.equal(native.status, 0, native.stderr);
                    assert.equal(native.stdout, oracle.stdout);
                    assert.equal(native.stderr, oracle.stderr);
                } catch (error) {
                    retain("failure.json", { error: String(error) });
                    throw error;
                }
            });
        }
