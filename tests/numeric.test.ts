import {test} from 'node:test';
import {expectProgram} from './helpers/program.js';

test('binary64 special values and signed zero',()=>expectProgram('console.log(1/0,-1/0,0/0,-0,1/-0);','Infinity -Infinity NaN 0 -Infinity\n'));
test('exact binary remainder',()=>expectProgram('console.log(5.5%2,-5.5%2,1%0,1e308%3,1%5e-324,1/(-4%2));',`1.5 -1.5 NaN ${1e308%3} 0 -Infinity\n`));
test('shortest decimal formatting boundaries',()=>expectProgram('console.log(0.1+0.2,5e-324,1e21,1e-7,1e-6,1e20);','0.30000000000000004 5e-324 1e+21 1e-7 0.000001 100000000000000000000\n'));
test('ES5 string number grammar',()=>expectProgram('console.log(+"",+" 0x10 ",+"-0",+"x",1/+"-0",+"0b10",+"0o10",+"-0x1",+".5",+"1.");','0 16 0 NaN -Infinity NaN NaN NaN 0.5 1\n'));
test('ES5 whitespace includes Mongolian vowel separator',()=>expectProgram('console.log(+"\\u180e42\\u180e",+"\\u200012\\ufeff",+"1 2");','42 12 NaN\n'));
test('parser exact midpoint and extremes',()=>{
  const strings=['2.2250738585072014e-308','2.2250738585072011e-308','4.9406564584124654e-324','2.4703282292062327e-324','2.4703282292062328e-324','1.7976931348623157e308','1.7976931348623159e308','9007199254740993','9007199254740995','1.00000000000000011102230246251565404236316680908203125','1.00000000000000011102230246251565404236316680908203126','1e999999999999999999999','-1e-99999999999999999999'];
  expectProgram('console.log('+strings.map(s=>'+'+JSON.stringify(s)).join(',')+');',strings.map(s=>String(Number(s))).join(' ')+'\n');
});
test('deterministic finite patterns shortest formatting',()=>{
  let seed=0x83a97c123bdead17n;const values:number[]=[];const bytes=new ArrayBuffer(8),dv=new DataView(bytes);
  for(let i=0;i<120;i++){seed=BigInt.asUintN(64,seed*6364136223846793005n+1442695040888963407n);dv.setBigUint64(0,seed);const v=dv.getFloat64(0);if(Number.isFinite(v))values.push(v);}
  values.push(Number.MAX_VALUE,Number.MIN_VALUE,2**-1022,2**53,2**53-1,1.0000000000000002,1000000000000000100);
  expectProgram('console.log('+values.map(v=>String(v)).join(',')+');',values.map(String).join(' ')+'\n');
});
test('long decimal suffixes preserve midpoint side and exponent cancellation',()=>{
  const midpoint='1.00000000000000011102230246251565404236316680908203125';
  const strings=[midpoint+'0'.repeat(2000),midpoint+'0'.repeat(2000)+'1','1'+'0'.repeat(3000)+'e-3000','0.'+'0'.repeat(3000)+'1e3001','0x'+'0'.repeat(2000)+'1','0x'+'f'.repeat(2000)];
  expectProgram('console.log('+strings.map(v=>'+'+JSON.stringify(v)).join(',')+');',strings.map(v=>String(Number(v))).join(' ')+'\n');
});
test('seeded parsing equality and exact remainder',()=>{
  let seed=0xf3989019abcd101n;const dv=new DataView(new ArrayBuffer(8));
  const next=()=>{seed=BigInt.asUintN(64,seed*6364136223846793005n+1442695040888963407n);dv.setBigUint64(0,seed);return dv.getFloat64(0);};
  const src:string[]=[],expected:string[]=[];
  for(let i=0;i<100;i++){
    const x=next(),y=next();if(!Number.isFinite(x)||!Number.isFinite(y))continue;
    const text=x.toPrecision(25);
    src.push(`console.log(+${JSON.stringify(text)}===${String(Number(text))},${String(x)}%${String(y)});`);
    expected.push('true '+String(x%y)+'\n');
  }
  expectProgram(src.join('\n'),expected.join(''));
});
test('large exponent cancels a dynamically built million-digit fractional prefix',()=>{
  expectProgram('var z="0";for(var i=0;i<20;i++)z+=z;console.log(+("0."+z+"1e1048577"));','1\n');
});
