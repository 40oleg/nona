import { test } from "node:test";
import { expectProgram } from "./helpers/program.js";
import assert from "node:assert/strict";
import { compileToIR } from "../src/compiler.js";
import { generate } from "../src/backend/x64/codegen.js";
import { linkHost } from "./helpers/program.js";
import { runNative } from "./helpers/native.js";
import { runOnHost } from "./helpers/host.js";
import { runOracle } from "./helpers/oracle.js";

test("WeakMap and WeakSet accept object keys and reject primitive additions", () =>
    expectProgram(
        `
 var key={},other={},map=new WeakMap(),set=new WeakSet();
 console.log(map instanceof WeakMap,set instanceof WeakSet,Object.prototype.toString.call(map),Object.prototype.toString.call(set));
 map.set(key,7);set.add(key);console.log(map.get(key),map.has(key),map.has(other),set.has(key),set.has(other));
 console.log(map.get(1),map.has(1),map.delete(1),set.has(1),set.delete(1));
 console.log(map.delete(key),map.has(key),set.delete(key),set.has(key));
 try{map.set(1,2)}catch(error){console.log(error.name)}
 try{set.add(1)}catch(error){console.log(error.name)}
`,
        "true true [object WeakMap] [object WeakSet]\n7 true false true false\nundefined false false false false\ntrue false true false\nTypeError\nTypeError\n",
    ));

test("collection constructors expose ES2020 arity zero", () =>
    expectProgram(
        `
 console.log(Map.length,Set.length,WeakMap.length,WeakSet.length);
`,
        "0 0 0 0\n",
    ));

test("WeakMap ephemeron values survive while their keys are live", () => {
    const source = `var key={id:7},map=new WeakMap(),set=new WeakSet();map.set(key,{id:9});set.add(key);for(var i=0;i<40;i++)({i:i});console.log(map.get(key).id,map.has(key),set.has(key));`;
    const run = runNative(
        linkHost(generate(compileToIR(source), { gcStress: true })),
    );
    assert.equal(run.status, 0, run.stderr.toString());
    assert.equal(run.stdout.toString(), "9 true true\n");
});

test("WeakMap ephemeron marking reaches keys through earlier values", () => {
    const source = `var first={id:1},second={id:2},map=new WeakMap();map.set(second,{id:9});map.set(first,second);second=null;for(var i=0;i<40;i++)({i:i});var recovered=map.get(first);console.log(recovered.id,map.get(recovered).id);`;
    const run = runNative(
        linkHost(generate(compileToIR(source), { gcStress: true })),
    );
    assert.equal(run.status, 0, run.stderr.toString());
    assert.equal(run.stdout.toString(), "2 9\n");
});

test("Weak collections remain usable after dead keys are pruned", () => {
    const source = `var map=new WeakMap(),set=new WeakSet();(function(){var dead={};map.set(dead,{id:1});set.add(dead)})();for(var i=0;i<40;i++)({i:i});var live={id:7};map.set(live,{id:9});set.add(live);console.log(map.get(live).id,set.has(live),map.delete(live),set.delete(live));`;
    const run = runNative(
        linkHost(generate(compileToIR(source), { gcStress: true })),
    );
    assert.equal(run.status, 0, run.stderr.toString());
    assert.equal(run.stdout.toString(), "9 true true true\n");
});

test("WeakMap and WeakSet constructors consume iterables", () =>
    expectProgram(
        `
 var a={},b={},map=new WeakMap([[a,1],[b,2]]),set=new WeakSet([a,b,a]);
 console.log(map.get(a),map.get(b),set.has(a),set.has(b));
 var mapSet=WeakMap.prototype.set,mapCalls=0;WeakMap.prototype.set=function(k,v){mapCalls++;return mapSet.call(this,k,v)};
 new WeakMap([[a,3]]);WeakMap.prototype.set=mapSet;
 var setAdd=WeakSet.prototype.add,setCalls=0;WeakSet.prototype.add=function(v){setCalls++;return setAdd.call(this,v)};
 new WeakSet([a]);WeakSet.prototype.add=setAdd;
 console.log(mapCalls,setCalls);
`,
        "1 2 true true\n1 1\n",
    ));

test("Weak collection constructors close iterators when adders throw", () =>
    expectProgram(
        `
 var a={},closed=0,iterable={[Symbol.iterator](){return {next(){return {value:a,done:false}},return(){closed++;return {done:true}}}}};
 var original=WeakSet.prototype.add;WeakSet.prototype.add=function(){throw new Error('stop')};
 try{new WeakSet(iterable)}catch(error){console.log(error.message)}WeakSet.prototype.add=original;
 console.log(closed);
`,
        "stop\n1\n",
    ));

// ES2023 CanBeHeldWeakly: unregistered symbols are weak keys, Symbol.for ones are not.
const symbolKeyCases: [string, string][] = [
    [
        "WeakMap and WeakSet accept unregistered symbol keys",
        `var a=Symbol(),b=Symbol('d'),map=new WeakMap(),set=new WeakSet();
 console.log(map.set(a,1)===map,map.set(b,{id:2})===map,set.add(a)===set);
 console.log(map.get(a),map.get(b).id,map.has(a),map.has(b),map.has(Symbol('d')),map.get(Symbol()));
 console.log(set.has(a),set.has(b),map.set(a,3).get(a));
 console.log(map.delete(a),map.has(a),map.delete(a),map.get(b).id,set.delete(a),set.has(a),set.delete(b));`,
    ],
    [
        "well-known symbols can be held weakly",
        `var map=new WeakMap(),set=new WeakSet();map.set(Symbol.iterator,'it');set.add(Symbol.asyncIterator);
 console.log(map.get(Symbol.iterator),map.has(Symbol.iterator),set.has(Symbol.asyncIterator),set.has(Symbol.iterator));
 console.log(map.delete(Symbol.iterator),map.has(Symbol.iterator));`,
    ],
    [
        "registered symbols cannot be held weakly",
        `var r=Symbol.for('x'),map=new WeakMap(),set=new WeakSet();
 try{map.set(r,1);console.log('no')}catch(e){console.log(e instanceof TypeError)}
 try{set.add(Symbol.for('x'));console.log('no')}catch(e){console.log(e instanceof TypeError)}
 try{new WeakMap([[r,1]]);console.log('no')}catch(e){console.log(e instanceof TypeError)}
 try{new WeakSet([r]);console.log('no')}catch(e){console.log(e instanceof TypeError)}
 console.log(map.get(r),map.has(r),map.delete(r),set.has(r),set.delete(r));`,
    ],
    [
        "weak collection constructors accept symbol keys",
        `var a=Symbol('a'),b=Symbol('b'),o={},map=new WeakMap([[a,1],[o,2],[b,3]]),set=new WeakSet([a,o,b,a]);
 console.log(map.get(a),map.get(o),map.get(b),set.has(a),set.has(o),set.has(b),set.has(Symbol('a')));`,
    ],
    [
        "symbol-keyed ephemeron values survive while their keys are live",
        `var key=Symbol('k'),map=new WeakMap(),set=new WeakSet();map.set(key,{id:9});set.add(key);
 map.set(Symbol.iterator,{id:4});
 for(var i=0;i<200;i++)({i:i,s:Symbol(),t:'x'+i});
 console.log(map.get(key).id,map.has(key),set.has(key),map.get(Symbol.iterator).id,String(key));`,
    ],
    [
        "weak collections stay usable after dead symbol keys are pruned",
        `var map=new WeakMap(),set=new WeakSet();
 (function(){for(var i=0;i<20;i++){var dead=Symbol('dead'+i);map.set(dead,{id:i});set.add(dead)}})();
 for(var i=0;i<200;i++)({i:i,s:Symbol()});
 var live=Symbol('live');map.set(live,{id:9});set.add(live);
 for(var i=0;i<100;i++)({i:i});
 console.log(map.get(live).id,set.has(live),map.delete(live),set.delete(live),map.has(live),set.has(live));`,
    ],
];
for (const [name, source] of symbolKeyCases)
    test(name, () => {
        const run = runOnHost(source);
        assert.equal(run.status, 0, run.stderr);
        assert.equal(run.stdout, runOracle(source).stdout);
    });
