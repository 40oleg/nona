import {test} from 'node:test';
import {expectProgram} from './helpers/program.js';

test('Number.toFixed exact rounding and layout',()=>{
 const source=`console.log((1.25).toFixed(1),(1.35).toFixed(1),(2.55).toFixed(1),(-0.001).toFixed(2),(-0).toFixed(2),(0).toFixed(0),(123).toFixed(4),(1e21).toFixed(2),(1.005).toFixed(2),Number.prototype.toFixed.call(new Number(1.5),0));`;
 expectProgram(source,[1.25,1.35,2.55,-.001,-0,0,123,1e21,1.005].map((x,i)=>x.toFixed([1,1,1,2,2,0,4,2,2][i]!)).join(' ')+' 2\n');
});
test('Number.toFixed seeded binary64 values and fraction widths',()=>{
 let seed=0x831d55a1729bc044n;const view=new DataView(new ArrayBuffer(8));
 const values=[Number.MIN_VALUE,Number.MAX_VALUE,0.5,1.25,1.005,1e-20,1e20,-1e-20,-1e20];
 for(let i=0;i<65;i++){seed=BigInt.asUintN(64,seed*6364136223846793005n+1442695040888963407n);view.setBigUint64(0,seed);const value=view.getFloat64(0);if(Number.isFinite(value))values.push(value);}
 const widths=[0,1,2,6,17,50,100];const expressions:string[]=[],expected:string[]=[];
 for(const [i,value] of values.entries()){const digits=widths[i%widths.length]!;expressions.push(`(${String(value)}).toFixed(${digits})`);expected.push(value.toFixed(digits));}
 expectProgram('console.log('+expressions.join(',')+');',expected.join(' ')+'\n');
});
test('Number.toExponential and toPrecision exact decimal layout',()=>{
 const values=[123.456,-123.456,0.0001,0.9999,25,1e21,5e-324,0,-0];
 const widths=[undefined,0,1,2,6,17,20,100] as const;
 const expressions:string[]=[],expected:string[]=[];
 for(const value of values)for(const width of widths){
  const literal=Object.is(value,-0)?'-0':String(value);
  if(width===undefined){expressions.push(`(${literal}).toExponential()`,`(${literal}).toPrecision()`);expected.push(value.toExponential(),value.toPrecision());}
  else {expressions.push(`(${literal}).toExponential(${width})`);expected.push(value.toExponential(width));if(width>0){expressions.push(`(${literal}).toPrecision(${width})`);expected.push(value.toPrecision(width));}}
 }
 expectProgram('console.log('+expressions.join(',')+');',expected.join(' ')+'\n');
});
test('Number significant formatting seeded binary64 values',()=>{
 let seed=0x94d11b31a7ce2f05n;const view=new DataView(new ArrayBuffer(8));
 const widths=[1,2,3,6,17,50,100];const expressions:string[]=[],expected:string[]=[];
 for(let i=0;i<70;i++){
  seed=BigInt.asUintN(64,seed*6364136223846793005n+1442695040888963407n);view.setBigUint64(0,seed);
  const value=view.getFloat64(0);if(!Number.isFinite(value))continue;
  const p=widths[i%widths.length]!,f=p-1,source=`(${String(value)})`;
  expressions.push(`${source}.toExponential(${f})`,`${source}.toPrecision(${p})`,`${source}.toExponential()`);
  expected.push(value.toExponential(f),value.toPrecision(p),value.toExponential());
 }
 expectProgram('console.log('+expressions.join(',')+');',expected.join(' ')+'\n');
});

test('binary64 special values and signed zero',()=>expectProgram('console.log(1/0,-1/0,0/0,-0,1/-0);','Infinity -Infinity NaN 0 -Infinity\n'));
test('exact binary remainder',()=>expectProgram('console.log(5.5%2,-5.5%2,1%0,1e308%3,1%5e-324,1/(-4%2));',`1.5 -1.5 NaN ${1e308%3} 0 -Infinity\n`));
test('shortest decimal formatting boundaries',()=>expectProgram('console.log(0.1+0.2,5e-324,1e21,1e-7,1e-6,1e20);','0.30000000000000004 5e-324 1e+21 1e-7 0.000001 100000000000000000000\n'));
test('small integer formatting boundaries',()=>expectProgram('console.log(-0,0,1,10,4294967295,4294967296,4294967295.5,-1);','0 0 1 10 4294967295 4294967296 4294967295.5 -1\n'));
test('ES2020 string number grammar',()=>expectProgram('console.log(+"",+" 0x10 ",+"-0",+"x",1/+"-0",+"0b10",+"0o10",+"-0x1",+".5",+"1.");','0 16 0 NaN -Infinity 2 8 NaN 0.5 1\n'));
test('ES2020 numeric whitespace excludes Mongolian vowel separator',()=>expectProgram('console.log(+"\\u180e42\\u180e",+"\\u200012\\ufeff",+"1 2");','NaN 12 NaN\n'));
test('binary and octal string conversion validates every digit and rounds large values',()=>{
  const inputs=['0b','0o','0b102','0o78','-0b10','+0o7','0B101','0O17',' 0b1 ','0b'+'0'.repeat(1200)+'1','0b1'+'0'.repeat(53)+'1','0b1'+'0'.repeat(1023),'0o7'+'0'.repeat(350)];
  expectProgram('console.log('+inputs.map(v=>'+'+JSON.stringify(v)).join(',')+');',inputs.map(v=>String(Number(v))).join(' ')+'\n');
});
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
