import {test} from 'node:test';
import assert from 'node:assert/strict';
import {compile} from '../src/compiler.js';
import {runOracle} from './helpers/oracle.js';
import {runNative} from './helpers/native.js';
import {expectProgram} from './helpers/program.js';
import {lex} from '../src/frontend/lexer.js';
import {parse} from '../src/frontend/parser.js';
import {bind} from '../src/frontend/binder.js';
import {lower} from '../src/ir/lower.js';
import {generate} from '../src/backend/x64/codegen.js';
import {linkPe} from '../src/backend/pe/writer.js';

const options={fileName:'block-functions.js',target:'win32-x64' as const};
function expectNativeOracle(source:string,gcStress=false){
  const result=runNative(linkPe(generate(lower(bind(parse(lex(source)))),{gcStress})));
  assert.equal(result.error,undefined);assert.equal(result.status,0,result.stderr.toString());
  assert.equal(result.stdout.toString(),runOracle(source).stdout);
}

const nodeCases:[string,string][]=[
  ['strict block hoisting and visibility','"use strict";{console.log(f());function f(){return 3;}}console.log(typeof f);'],
  ['nested block shadow','"use strict";function f(){return 1;}{console.log(f());function f(){return 2;}console.log(f());}console.log(f());'],
  ['closure captures current block binding','"use strict";let out;{function f(){return 7;}out=function(){return f();};}console.log(out());'],
  ['switch shares one lexical scope','"use strict";switch(1){case 1:console.log(f());function f(){return 9;}break;}'],
];
for(const [name,source] of nodeCases)test('block function: '+name,()=>expectNativeOracle(source));

for(const source of [
  '"use strict";if(true)function f(){}',
  '"use strict";label:function f(){}',
  '"use strict";{function f(){}function f(){}}',
  '"use strict";switch(0){case 0:function f(){}case 1:function f(){}}',
  '"use strict";{function f(){}let f;}',
  '"use strict";try{throw 1;}catch(e){function e(){}}',
])test('block function early error: '+source,()=>assert.equal(compile(source,options).ok,false));

test('sloppy block function remains block scoped',()=>{
  expectProgram('{console.log(f());function f(){return 4;}}console.log(typeof f);','4\nundefined\n');
});

test('each block entry gives captured functions a fresh cell under GC stress',()=>{
  const source='"use strict";let a=[];for(let i=0;i<3;i++){{function f(){return i;}a[i]=function(){return f();};}}for(let i=0;i<30;i++){({x:""+i});}console.log(a[0](),a[1](),a[2]());';
  expectNativeOracle(source,true);
});
