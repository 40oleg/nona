import {test} from 'node:test';
import {expectProgram} from './helpers/program.js';
import {runOracle} from './helpers/oracle.js';

const cases:[string,string][]=[
 ['property and mixed chains','let a=null,b={x:{y:4}};console.log(a?.x.y,b?.x.y,b?.missing?.y);'],
 ['computed key is skipped','let n=0,a=null,b={x:3};console.log(a?.[++n],b?.[(n++,"x")],n);'],
 ['base identifier still resolves','try{console.log(missing?.x);}catch(e){console.log(e.name);}'],
 ['getter errors are not swallowed','let o={get x(){throw 7;}};try{o?.x;}catch(e){console.log(e);}'],
 ['property receivers survive optional and grouped calls','let o={x:6,m(){return this.x;}};console.log(o?.m(),o.m?.(),(o?.m)());'],
 ['nested optional chain keeps grouped property receiver','let o={x:6,m(){return this;}};console.log((o?.m)?.()===o,(o?.m)()?.x);'],
 ['nested optional call keeps strict receiver and skips nullish arguments','let n=0,o={x:6,m(a){"use strict";return this.x+a;}};console.log((o?.m)?.(++n),n);o=null;console.log((o?.m)?.(++n),n);'],
 ['optional super method keeps receiver','let base={x(){return this.v;}};let o={__proto__:base,v:7,m(){return super.x?.();}};console.log(o.m());'],
 ['arguments are skipped','let n=0,f=null,g=function(x){return x;};console.log(f?.(++n),g?.(++n),n);'],
 ['noncallable and missing method errors remain','let o={x:1};try{o?.x();}catch(e){console.log(e.name);}try{o?.missing();}catch(e){console.log(e.name);}'],
 ['delete nullish and live properties','let a=null,o={x:1};console.log(delete a?.x,delete o?.x,"x" in o);'],
 ['delete computed key is skipped','let n=0,a=null;console.log(delete a?.[++n],n);'],
 ['parentheses terminate short circuit','let a=null;console.log(a?.b.c);try{console.log((a?.b).c);}catch(e){console.log(e.name);}'],
];
for(const [name,source] of cases)test(name,()=>expectProgram(source,runOracle(source).stdout));

test('strict delete preserves descriptor failure',()=>{
 expectProgram('"use strict";let o={};Object.defineProperty(o,"x",{value:1,configurable:false});try{delete o?.x;}catch(e){console.log(e.name);}',
  'TypeError\n');
});
