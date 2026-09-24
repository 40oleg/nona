import {test} from 'node:test';
import assert from 'node:assert/strict';
import {compile} from '../src/compiler.js';
import {expectProgram} from './helpers/program.js';
import {runOracle} from './helpers/oracle.js';

test('do while enters once and continue evaluates the condition',()=>{
  expectProgram('var x=0;do{x++;if(x<3)continue;}while(x<3);console.log(x);do{x++;}while(false)console.log(x);','3\n4\n');
});
test('switch default can precede a match and matched clauses fall through',()=>{
  expectProgram('var s="";switch(2){case 1:s+="a";break;default:s+="d";case 2:s+="b";case 3:s+="c";}console.log(s);','bc\n');
});
test('switch tests cases only until a match and uses strict equality',()=>{
  const source='var n=0;function c(x){n++;return x;}switch("1"){case c(1):console.log("wrong");break;default:console.log("default");break;case c("1"):console.log("match");case c(2):console.log("fallthrough");}console.log(n);';
  expectProgram(source,'match\nfallthrough\n2\n');
});
test('unmatched switch evaluates cases after default before executing default',()=>{
  const source='var x=0;switch(9){case (x+=1):break;default:console.log(x);case (x+=2):console.log("tail");}switch(1){}console.log(x);';
  expectProgram(source,'3\ntail\n3\n');
});
test('switch discriminant is evaluated once and preserves NaN and signed zero semantics',()=>{
  const source='var n=0;switch(++n){case 1:console.log(n);break;}switch(NaN){case NaN:console.log("bad");break;default:console.log("nan");}switch(-0){case 0:console.log("zero");}';
  expectProgram(source,'1\nnan\nzero\n');
});
test('continue traverses switch to the enclosing loop',()=>{
  expectProgram('var n=0;outer:for(var i=0;i<3;i++){switch(i){case 1:continue outer;}n++;}console.log(n);','2\n');
  expectProgram('var n=0;for(var i=0;i<3;i++){switch(i){case 1:continue;default:n++;}}console.log(n);','2\n');
});
test('chained loop labels and block breaks resolve to their own targets',()=>{
  const source='var n=0;a:b:for(var i=0;i<3;i++){for(var j=0;j<4;j++){n++;continue a;}}stop:{n+=10;break stop;n=999;}console.log(n);';
  expectProgram(source,'13\n');
});
test('labelled continue and break preserve nested do and for updates',()=>{
  const source='var x=0,y=0;outer:do{x++;for(var j=0;j<2;j++){y++;if(x<3)continue outer;break outer;}}while(x<5);console.log(x,y);';
  expectProgram(source,'3 3\n');
});
test('var declarations hoist from do switch and labelled blocks',()=>{
  expectProgram('function f(){console.log(a,b,c);do{var a=1;}while(false);switch(1){case 1:var b=2;}label:{var c=3;}console.log(a,b,c);}f();','undefined undefined undefined\n1 2 3\n');
});
test('unlabelled break exits switch but not the surrounding loop',()=>{
  const source='var n=0;for(var i=0;i<3;i++){switch(i){case 0:n+=10;break;case 1:n+=20;break;default:n+=30;}n++;}console.log(n);';
  expectProgram(source,runOracle(source).stdout);
});
test('debugger is a no-op without a debugger',()=>expectProgram('debugger;console.log(7);','7\n'));
test('line break after break prevents consuming a label',()=>{
  expectProgram('var x=0,outer=5;outer:while(true){while(true){break\nouter;x=9;}x++;break;}console.log(x);','1\n');
});
for(const source of [
  'break nowhere;', 'a:{continue a;}', 'a:while(true){a:break a;}',
  'switch(0){default:;default:;}', 'switch(0){case 1:continue;}',
  'a:{while(true){continue a;}}','a:{break;}','do{}while(false)break;',
  'a:while(false){}break a;', 'while(true){continue missing;}',
]) test('invalid control flow is diagnosed: '+source,()=>{
  const result=compile(source,{fileName:'control.js',target:'win32-x64'});
  assert.equal(result.ok,false);
  if(!result.ok)assert.match(result.diagnostics[0]!.code,/^E_(SYNTAX|BIND)$/);
});
