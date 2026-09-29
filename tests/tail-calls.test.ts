import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runOracle} from './helpers/oracle.js';
import {runOnHost} from './helpers/host.js';

const expected:Record<string,string>={
 'deep strict tail recursion uses bounded stack':'done\nfalse\n200000!\n,3\ndeep\napply\n',
 'tail positions in conditional, logical and comma expressions':'true true\n',
};
const cases:[string,string,boolean][]=[
 [
  "deep strict tail recursion uses bounded stack",
  "\"use strict\";\nfunction count(n){ if(n===0) return 'done'; return count(n-1); }\nconsole.log(count(1000000));\nfunction even(n){ return n===0 ? true : odd(n-1); } function odd(n){ return n===0 ? false : even(n-1); }\nconsole.log(even(300001));\nvar o={m(n,acc){ return n===0 ? acc+this.tag : this.m(n-1, acc+1); }, tag:'!'};\nconsole.log(o.m(200000,0));\nfunction f(){ return g.call(null, 1, 2); } function g(a,b){ return [this, a+b].join(); } console.log(f());\nfunction thrower(n){ if(n===0) throw new Error('deep'); return thrower(n-1); }\ntry{ thrower(100000); }catch(e){ console.log(e.message); }\nfunction viaApply(n){ return n===0 ? 'apply' : viaApply.apply(null,[n-1]); } console.log(viaApply(1000));\n",
  false
 ],
 [
  "tail positions in conditional, logical and comma expressions",
  "\"use strict\";function a(n){return n>0?b(n-1):\"a\";}function b(n){return n<=0||(0,a(n-1));}console.log(a(100001),b(100000));",
  true
 ],
 [
  "non-tail calls and sloppy functions keep normal semantics",
  "function s(n){return n===0?\"sloppy\":s(n-1);}console.log(s(1000));(function(){\"use strict\";function t(){try{return u();}finally{console.log(\"finally\");}}function u(){return \"u\";}console.log(t());})();",
  true
 ],
 [
  "tail calls survive GC with arguments",
  "\"use strict\";function f(n,o){for(var i=0;i<5;i++)({x:\"\"+i});return n===0?o.s:f(n-1,{s:o.s+\"\"});}console.log(f(200,{s:\"keep\"}));",
  true
 ]
];
for(const [name,source] of cases)test('tail calls: '+name,()=>{
 const result=runOnHost(source,{gcStress:name.includes('GC')});
 assert.equal(result.error,undefined);
 assert.equal(result.status,0,result.stderr);
 // Node has no proper tail calls, so deep chains are checked against fixed output.
 assert.equal(result.stdout,expected[name]??runOracle(source).stdout);
});
