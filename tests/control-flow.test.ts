import { test } from 'node:test';
import { expectProgram } from './helpers/program.js';
test('for continue executes update',()=>expectProgram('var s=0;for(var i=0;i<6;i++){if(i==2)continue;s+=i;}console.log(s);','13\n'));
test('while break exits',()=>expectProgram('var i=0;while(true){i++;if(i===3)break;}console.log(i);','3\n'));
test('short circuit preserves operand values and skips effects',()=>expectProgram('var x=0;false&&(x=1);true||(x=2);console.log(x,0||7,2&&4);','0 7 4\n'));
test('compound assignment reads LHS first, postfix returns old value',()=>expectProgram('var x=1;x+=(x=4);console.log(x,x++,++x);','5 5 7\n'));
