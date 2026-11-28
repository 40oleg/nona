import { test } from "node:test";
import assert from "node:assert/strict";
import { runOnHost } from "./helpers/host.js";
import { runOracle } from "./helpers/oracle.js";
import { preludeSet } from "../src/link.js";
import { compile, hostTarget } from "../src/compiler.js";
import { runNative } from "./helpers/native.js";
import {
    functionModule,
    callbackModule,
    memoryModule,
    indirectModule,
    numericModule,
    numericCases,
    controlModule,
    bulkModule,
    accessModule,
    tableModule,
    i32,
    i64,
    sleb,
    moduleBytes,
    section,
    vec,
    type,
    body,
    exported,
    name,
} from "./helpers/wasm.js";

const bytes = (b: number[]) => `new Uint8Array(${JSON.stringify(b)})`;
function oracle(source: string, stress = true) {
    const expected = runOracle(source);
    const native = runOnHost(source, {
        gcStress: stress,
        link: {
            regexp: false,
            unicodeProperties: false,
            unicodeSets: false,
            unicodeStringProperties: false,
            unicodeNormalization: false,
            float16: false,
            preludes: { ...preludeSet(false), webAssembly: true },
        },
    });
    assert.equal(native.status, 0, native.stderr + native.stdout);
    assert.equal(native.stdout, expected.stdout);
    assert.equal(native.stderr, "");
}

test("WebAssembly scalar execution, exact i64 and async compile/instantiate", () => {
    oracle(`
        var b=${bytes(functionModule([i32, i32], [i32], [32, 0, 32, 1, 108]))};
        var m=new WebAssembly.Module(b), i=new WebAssembly.Instance(m);
        console.log(WebAssembly.validate(b),i.exports.run(2147483647,3));
        var wide=new WebAssembly.Instance(new WebAssembly.Module(${bytes(functionModule([i64], [i64], [32, 0, 66, ...sleb(9007199254740993n), 124]))}));
        console.log(String(wide.exports.run(7n)));
        try {wide.exports.run(7)} catch(e) {console.log(e.name)}
        WebAssembly.compile(b).then(function(mod){return WebAssembly.instantiate(mod)}).then(function(inst){console.log(inst.exports.run(6,7));return WebAssembly.instantiate(b)}).then(function(pair){console.log(pair.module instanceof WebAssembly.Module,pair.instance.exports.run(2,9))});
    `);
});

test("WebAssembly memory identity, unaligned bytes, growth, detached old views and traps", () => {
    oracle(`
        var m=new WebAssembly.Memory({initial:1,maximum:3});
        var i=new WebAssembly.Instance(new WebAssembly.Module(${bytes(memoryModule)}),{e:{m:m}});
        console.log(i.exports.memory===m,Array.from(new Uint8Array(m.buffer,0,3)).join(','));
        console.log(String(i.exports.store(3, -9223372036854775807n)));
        var old=m.buffer,v=new Uint8Array(old);console.log(i.exports.grow(1),old.byteLength,v.length,m.buffer.byteLength);
        console.log(String(new DataView(m.buffer).getBigInt64(3,true)),i.exports.grow(2));
        console.log(m.grow(0),m.buffer.byteLength);
        try {m.grow(2)} catch(e) {console.log(e.name)}
        try {i.exports.store(196604,1n)} catch(e) {console.log(e.name)}
        try {i.exports.store(-1,1n)} catch(e) {console.log(e.name)}
    `);
});

test("WebAssembly Emscripten callback wrappers, shared table, reentry and exception identity", () => {
    oracle(`
        var tab=new WebAssembly.Table({element:'anyfunc',initial:1,maximum:3});
        var inst=new WebAssembly.Instance(new WebAssembly.Module(${bytes(indirectModule)}),{e:{t:tab}});
        var thrown={message:'callback'}, reenter=false;
        var callback=function(a,b){var keep={text:'kept '+a};new Array(20).fill('allocation');
            if(a===99)throw thrown;if(a===98)throw Infinity;
            if(!reenter){reenter=true;var result=inst.exports.run(a+1,b,0);reenter=false;return result+keep.text.length;}
            return a+b;};
        try{tab.set(0,callback)}catch(e){console.log(e.name)}
        var wrap=new WebAssembly.Instance(new WebAssembly.Module(${bytes(callbackModule)}),{e:{f:callback}}).exports.f;
        tab.set(0,wrap); console.log(tab.get(0)===wrap,tab.length,inst.exports.run(2,3,0));
        console.log(tab.grow(1),tab.get(1));
        try{inst.exports.run(1,2,1)}catch(e){console.log(e.name)}
        try{inst.exports.run(1,2,9)}catch(e){console.log(e.name)}
        try{inst.exports.run(99,0,0)}catch(e){console.log(e===thrown)}
        try{inst.exports.run(98,0,0)}catch(e){console.log(e===Infinity)}
        var wrong=new WebAssembly.Instance(new WebAssembly.Module(${bytes(functionModule([], [i32], [65, 1]))})).exports.run;
        tab.set(1,wrong);try{inst.exports.run(1,2,1)}catch(e){console.log(e.name)}
        console.log(inst.exports.run(3,4,0));
    `);
});

test("WebAssembly rejects malformed binaries, invalid stacks and missing imports", () => {
    const invalid = [
        [],
        [0, 97, 115, 109, 2, 0, 0, 0],
        functionModule([], [i32], []),
        functionModule([], [], [32, 0]),
        functionModule([], [], [65, 0]),
        functionModule([], [], [12, 1]),
        functionModule([], [], [255]),
    ];
    oracle(`
        var bad=${JSON.stringify(invalid)};
        for(var j=0;j<bad.length;j++){var b=new Uint8Array(bad[j]);console.log(WebAssembly.validate(b));try{new WebAssembly.Module(b)}catch(e){console.log(e.name)}}
        var mod=new WebAssembly.Module(${bytes(callbackModule)});
        for(var imp of [{},{e:{}},{e:{f:1}}]){try{new WebAssembly.Instance(mod,imp)}catch(e){console.log(e.name)}}
        WebAssembly.compile(new Uint8Array([1])).catch(function(e){console.log(e.name)});
    `);
});

test("WebAssembly all scalar opcodes agree with Node on edges, exact i64 and traps", () => {
    oracle(
        `
        var e=new WebAssembly.Instance(new WebAssembly.Module(${bytes(numericModule)})).exports;
        var cases=${JSON.stringify(numericCases)},ints=[0,1,-1,2147483647,-2147483648,33,-65537];
        var wide=[0n,1n,-1n,9223372036854775807n,-9223372036854775808n,9007199254740993n,4611686293305294849n];
        var floats=[0,-0,1.5,-2.5,NaN,Infinity,-Infinity,4294967295,18446744073709551616,-2147483648.75];
        function show(v){return Object.is(v,-0)?'-zero':String(v)}
        for(var c of cases){var inputs=c.params[0]===127?ints:c.params[0]===126?wide:floats;
            for(var j=0;j<inputs.length;j++){try{console.log(c.op,j,show(e['op'+c.op](inputs[j],inputs[(j+1)%inputs.length])))}catch(err){console.log(c.op,j,err.name)}}
        }
    `,
        false,
    );
});

test("WebAssembly structured control, start, imported globals and custom section ownership", () => {
    oracle(`
        var b=${bytes(controlModule)},m=new WebAssembly.Module(b),g=new WebAssembly.Global({value:'i32',mutable:true},10);
        b.fill(0);var e=new WebAssembly.Instance(m,{e:{g:g}}).exports;
        console.log(e.factorial(0),e.factorial(6),e.choose(0),e.choose(1),g.value,e.g===g,e.answer.value);
        e.g.value=90;console.log(g.value);try{e.answer.value=0}catch(err){console.log(err.name)}
        console.log(JSON.stringify(WebAssembly.Module.imports(m)),JSON.stringify(WebAssembly.Module.exports(m)));
        var a=WebAssembly.Module.customSections(m,'dylink.0');new Uint8Array(a[0])[0]=99;
        console.log(Array.from(new Uint8Array(WebAssembly.Module.customSections(m,'dylink.0')[0])).join(','));
        console.log(Object.getPrototypeOf(e)===null,Object.isExtensible(e));
    `);
});

test("WebAssembly bulk memory initialization, overlap, fill and dropped-segment bounds", () => {
    oracle(`
        var e=new WebAssembly.Instance(new WebAssembly.Module(${bytes(bulkModule)})).exports;
        e.init(2,0,4);e.copy(3,2,4);e.fill(0,258,2);console.log(Array.from(new Uint8Array(e.memory.buffer,0,8)).join(','));
        try{e.init(0,0,1)}catch(err){console.log(err.name)}
        e.init(65536,0,0);e.copy(65536,65536,0);
        for(var f of [function(){e.copy(65535,0,2)},function(){e.copy(0,65535,2)},function(){e.fill(-1,0,1)},function(){e.init(65537,0,0)}])try{f()}catch(err){console.log(err.name)}
    `);
});

test("WebAssembly br_table, multivalue blocks, direct calls and unreachable traps", () => {
    const bt = functionModule(
        [i32],
        [i32],
        [2, 64, 2, 64, 32, 0, 14, 1, 0, 1, 11, 65, 12, 15, 11, 65, 30],
    );
    const multi = moduleBytes(
        section(1, vec([type([], [i32, i64]), type([i32], [i32, i64])])),
        section(3, vec([[1]])),
        section(7, vec([exported("run", 0, 0)])),
        section(
            10,
            vec([body([32, 0, 4, 0, 65, 7, 66, 9, 5, 65, 8, 66, 10, 11])]),
        ),
    );
    oracle(`
        var e=new WebAssembly.Instance(new WebAssembly.Module(${bytes(bt)})).exports;
        console.log(e.run(0),e.run(1),e.run(-1));
        var f=new WebAssembly.Instance(new WebAssembly.Module(${bytes(multi)})).exports.run;console.log(f(0).join(','),f(1).join(','));
        var trap=new WebAssembly.Instance(new WebAssembly.Module(${bytes(functionModule([], [], [0]))})).exports.run;try{trap()}catch(err){console.log(err.name)}
    `);
});

test("WebAssembly memory buffers cannot be transferred and i64 coercion follows ToBigInt", () => {
    oracle(`
        var m=new WebAssembly.Memory({initial:1,maximum:2});
        for(var method of ['transfer','transferToFixedLength'])try{m.buffer[method]()}catch(e){console.log(e.name,m.buffer.byteLength)}
        var f=new WebAssembly.Instance(new WebAssembly.Module(${bytes(functionModule([i64], [i64], [32, 0]))})).exports.run;
        for(var v of [true,'9007199254740993',{valueOf:function(){return 7n}},{valueOf:function(){return 7}},null,undefined,1])try{console.log(String(f(v)))}catch(e){console.log(e.name)}
        try{new f(1n)}catch(e){console.log(e.name)}
    `);
});

test("WebAssembly every scalar load/store checks bounds and preserves little-endian bytes", () => {
    oracle(`
        var e=new WebAssembly.Instance(new WebAssembly.Module(${bytes(accessModule)})).exports,view=new Uint8Array(e.memory.buffer);
        view.set([128,255,1,128,2,254,0,128],3);
        for(var op=40;op<=53;op++){console.log(op,String(e['op'+op](3)));try{e['op'+op](-1)}catch(err){console.log(err.name)}}
        var types=[0,1,0,0,0,0,1,1,1];
        for(var op=54;op<=62;op++){view.fill(0,0,16);e['op'+op](3,types[op-54]? -9007199254740993n:-65537);console.log(op,Array.from(view.subarray(0,12)).join(','));try{e['op'+op](-1,types[op-54]?1n:1)}catch(err){console.log(err.name)}}
    `);
});

test("WebAssembly passive table elements, reference instructions, growth, copy and fill", () => {
    oracle(`
        var e=new WebAssembly.Instance(new WebAssembly.Module(${bytes(tableModule)})).exports;
        e.init(0,0,1);console.log(e.table.get(0)===e.f,e.call(0));
        e.copy(1,0,1);console.log(e.call(1),e.grow(2),e.call(3),e.clear(0));
        try{e.call(0)}catch(err){console.log(err.name)}
        try{e.init(0,0,1)}catch(err){console.log(err.name)}
        console.log(e.grow(2));try{e.copy(3,0,2)}catch(err){console.log(err.name)}
    `);
});

test("WebAssembly rejects incompatible import limits, global mutability and function signatures", () => {
    const globalImport = (t: number, mutable: number) =>
        moduleBytes(
            section(2, vec([[...name("e"), ...name("g"), 3, t, mutable]])),
        );
    oracle(`
        var m=new WebAssembly.Module(${bytes(memoryModule)});
        for(var v of [null,{},new WebAssembly.Memory({initial:0,maximum:3}),new WebAssembly.Memory({initial:1,maximum:4}),new WebAssembly.Memory({initial:1})])try{new WebAssembly.Instance(m,{e:{m:v}})}catch(err){console.log(err.name)}
        var mut=new WebAssembly.Module(${bytes(globalImport(i32, 1))}),imm=new WebAssembly.Module(${bytes(globalImport(i64, 0))});
        for(var v of [0,{},new WebAssembly.Global({value:'i32'},0),new WebAssembly.Global({value:'i64',mutable:true},0n)])try{new WebAssembly.Instance(mut,{e:{g:v}})}catch(err){console.log(err.name)}
        for(var v of [0,'0',new WebAssembly.Global({value:'i32'},0)])try{new WebAssembly.Instance(imm,{e:{g:v}})}catch(err){console.log(err.name)}
        var f=new WebAssembly.Instance(new WebAssembly.Module(${bytes(functionModule([], [], []))})).exports.run;
        try{new WebAssembly.Instance(new WebAssembly.Module(${bytes(callbackModule)}),{e:{f:f}})}catch(err){console.log(err.name)}
    `);
});

test("WebAssembly callback growth refreshes memory and retained exports keep their owner alive", () => {
    const reentrant = moduleBytes(
        section(1, vec([type([], []), type([], [i64])])),
        section(
            2,
            vec([
                [...name("e"), ...name("callback"), 0, 0],
                [...name("e"), ...name("memory"), 2, 1, 1, 2],
            ]),
        ),
        section(3, vec([[1]])),
        section(7, vec([exported("run", 0, 1)])),
        section(10, vec([body([16, 0, 65, 3, 41, 0, 0])])),
    );
    oracle(`
        var memory=new WebAssembly.Memory({initial:1,maximum:2}),old=memory.buffer;
        var run=new WebAssembly.Instance(new WebAssembly.Module(${bytes(reentrant)}),{e:{memory:memory,callback:function(){memory.grow(1);new DataView(memory.buffer).setBigInt64(3,9007199254740993n,true);new Array(30).fill({kept:true});}}}).exports.run;
        for(var i=0;i<5;i++)new Array(20).fill({collect:i});
        console.log(String(run()),old.byteLength,memory.buffer.byteLength);
    `);
});

test("WebAssembly callbacks use intrinsic Call and multivalue returns require an iterator", () => {
    const multi = moduleBytes(
        section(1, vec([type([], [i32, i32])])),
        section(2, vec([[...name("e"), ...name("f"), 0, 0]])),
        section(7, vec([exported("run", 0, 0)])),
    );
    oracle(`
        var f=function(a,b){return a+b};f.apply=function(){return 99};
        var run=new WebAssembly.Instance(new WebAssembly.Module(${bytes(callbackModule)}),{e:{f:f}}).exports.f;
        console.log(run(2,3));f.apply=null;try{console.log(run(4,5))}catch(err){console.log(err.name)}
        var result={0:7,1:9,length:2},thrown={iterator:true};
        var multi=new WebAssembly.Instance(new WebAssembly.Module(${bytes(multi)}),{e:{f:function(){return result}}}).exports.run;
        try{console.log(multi().join(','))}catch(err){console.log(err.name)}
        result=[7,9];console.log(multi().join(','));
        result={};Object.defineProperty(result,Symbol.iterator,{get:function(){throw thrown}});
        try{multi()}catch(err){console.log(err===thrown)}
        var count=0;result={};Object.defineProperty(result,Symbol.iterator,{get:function(){count++;if(count>1)throw thrown;return function(){return [2,3][Symbol.iterator]()}}});
        console.log(multi().join(','),count);
    `);
});

test("WebAssembly lexical optional linking runs in a standalone executable", () => {
    assert.ok(hostTarget);
    const source = `var m=new WebAssembly.Module(${bytes(functionModule([], [i32], [65, 42]))});console.log(new WebAssembly.Instance(m).exports.run());`;
    const result = compile(source, { fileName: "wasm.js", target: hostTarget });
    assert.ok(result.ok, result.ok ? "" : JSON.stringify(result.diagnostics));
    if (!result.ok) return;
    const native = runNative(result.image);
    assert.equal(native.status, 0, native.stderr.toString());
    assert.equal(native.stdout.toString(), runOracle(source).stdout);
});

test("WebAssembly i64 callbacks preserve exact arguments, results and conversion failures", () => {
    const wrapper = moduleBytes(
        section(1, vec([type([i64, i64], [i64])])),
        section(2, vec([[...name("e"), ...name("f"), 0, 0]])),
        section(7, vec([exported("run", 0, 0)])),
    );
    oracle(`
        var bad=false,fn=function(a,b){new Array(10).fill({kept:a});return bad?1:a+b};
        var run=new WebAssembly.Instance(new WebAssembly.Module(${bytes(wrapper)}),{e:{f:fn}}).exports.run;
        console.log(String(run(9007199254740993n,9007199254740995n)));
        console.log(String(run(9223372036854775807n,1n)));
        bad=true;try{run(1n,2n)}catch(e){console.log(e.name)}
        bad=false;console.log(String(run(-9007199254740993n,2n)));
    `);
});

test("WebAssembly memory transfer lists fail before detaching other buffers", () => {
    const source = `var memory=new WebAssembly.Memory({initial:1}),other=new ArrayBuffer(2);
        try{structuredClone({memory:memory.buffer},{transfer:[other,memory.buffer]})}catch(e){console.log(e.name)}
        console.log(other.byteLength,memory.buffer.byteLength);
        var copy=structuredClone(memory.buffer);console.log(copy.byteLength,copy!==memory.buffer);`;
    const expected = runOracle(source),
        native = runOnHost(source, { gcStress: true });
    assert.equal(native.status, 0, native.stderr);
    assert.equal(native.stdout, expected.stdout);
});
