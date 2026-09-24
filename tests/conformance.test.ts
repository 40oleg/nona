import {test} from 'node:test';
import {expectProgram} from './helpers/program.js';
import {runOracle} from './helpers/oracle.js';
const programs=[
 'console.log("2"+3,"2"-1,null==undefined,NaN===NaN);',
 'console.log("10"<"2",""||"ok",typeof missing);',
 'function s(){return "a"+"b";}console.log(s()+s());',
 'var x=1;x="строка";x=false;console.log(x);',
 'console.log();console.log(console.log("%s","x"));',
 'console.log("a\\0b","😀","\\ud800","\\udfff");',
 'console.log("a\\0a"<"a\\0b","😀"<"\\uffff");',
 'console.log(1/0,-1/0,0/0,-0,1/-0);',
 'console.log(NaN<0,NaN<=0,NaN>0,NaN>=0,NaN==NaN);',
 'console.log(null==0,undefined==0,false=="",true=="1",null==false);',
 'console.log(typeof null,typeof false,typeof 0,typeof "",typeof undefined);',
 'console.log(!NaN,!0,!-0,!"",!null,!undefined,!Infinity);',
 'var i=0;while(i<5){i++;if(i<3)continue;console.log(i);}',
 'function f(){console.log(x);var x=3;return x;}var x=9;console.log(f(),x);',
 'function f(a){return a;}var x=0;console.log(f(++x,++x),x);',
 'var x=0;console.log((x=1)+(x=2),x);',
 'var x=0;console.log(true?(x=1):(x=2),false?(x=3):(x=4),x);',
 'var x="2";console.log(x++,x,--x);',
 'function f(){return\n99;}console.log(f());',
 'var s="";for(var i=0;i<100;i++)s+="ab";console.log(s);',
];
for(const [i,source] of programs.entries())test('native matches JavaScript '+i,()=>expectProgram(source,runOracle(source).stdout));
