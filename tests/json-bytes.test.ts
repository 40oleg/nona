import { test } from "node:test";
import assert from "node:assert/strict";
import { runModulesOnHost } from "./helpers/host.js";

// nona:json stringifyToBuffer (#155) against Buffer.from(JSON.stringify(...))
// in Node.js: the same program prints the bytes as hex on both sides.
const nona = `import {stringifyToBuffer as toBytes} from 'nona:json';\n`;
const oracle = `const toBytes=(v,r,s)=>{const t=JSON.stringify(v,r,s);return t===undefined?undefined:Buffer.from(t)};\n`;
const prelude = `import {Buffer} from 'node:buffer';
const show=(b)=>b===undefined?'undefined':(Buffer.isBuffer(b)?'':'not a Buffer ')+b.toString('hex');
const run=(...args)=>{try{console.log(show(toBytes(...args)))}catch(e){console.log(e.name)}};
`;

function expectSameAsNode(body: string, gcStress = true) {
    const { native, oracle: expected } = runModulesOnHost(
        { "main.mjs": nona + prelude + body },
        "main.mjs",
        { gcStress, oracleSource: oracle + prelude + body },
    );
    assert.equal(native.error, undefined);
    assert.equal(native.status, 0, native.stderr);
    assert.equal(native.stdout, expected);
}

test("nona:json stringifyToBuffer matches Buffer.from(JSON.stringify()) under GC stress", () =>
    expectSameAsNode(`
const nested={a:[1,{b:2,c:[true,false,null]}],s:"x",e:{},z:[]};
run(nested);
run({toJSON(k){return {key:k,v:1}}});
run({d:new Date(0),n:{toJSON(){return undefined}}});
run({a:1,b:[1,2],c:{d:3,s:'q'}},(k,v)=>typeof v==='number'?v*2:v);
run({a:1,b:2,c:{a:5,z:6}},['a','c']);
run({a:1,b:2,1:3},['1','b',1]);
run([1,{a:2}],(k,v)=>k==='a'?undefined:v);
for(const space of [2,'\\t',20,-1,'abcdefghijklmn','é→🎉','\\ud800',new Number(1),new String('--')])
    run(nested,null,space);
for(const s of ['Latin-1 éàü ÿ','Кириллица','中文漢字','emoji 🎉👍🏽','\\ud800','\\udc00x','a\\ud800\\udc00b','\\udbff','x\\udfff\\ud800',
    'abcdefgh','abc"defgh','abcd\\\\efgh','abcdéfgh','abcdefg\\n','\\u0000\\u0001\\u001f\\b\\t\\n\\f\\r"\\\\/\\u007f\\u0080\\u07ff\\u0800\\uffff'])
    run(s);
run({'\\ud83d':1,'ключ':'значение','😀':'\\udfff','a"b':'\\n'},null,1);
run(-0);
run([-0,NaN,Infinity,-Infinity,1e21,1.5e-7,123456789012345680000,0.1,-5,9007199254740991,-9007199254740992]);
for(const v of [undefined,function(){},Symbol('x'),true,null,'str',new Number(3),new String('s'),new Boolean(false)])
    run(v);
run({a:undefined,b:()=>1,c:Symbol(),d:1});
run([undefined,()=>1,Symbol()]);
run(1n);
run({a:[1n]});
run(Object(2n));
const cycle={a:[]};cycle.a.push(cycle);
run(cycle);
run({after:'cycle'});
let holder;
run(5,function(k,v){if(k==='')holder=this;return v});
console.log(JSON.stringify(holder),Object.keys(holder).length);
console.log(JSON.stringify(nested,null,2),JSON.stringify('\\ud800é🎉'),JSON.stringify(undefined));
`));

test("nona:json stringifyToBuffer grows past 64 KiB and nests as deep as JSON.stringify", () =>
    expectSameAsNode(
        `
const big=Array.from({length:6000},(_,i)=>({i,s:'ж'+i+'🎉',q:'"\\\\'}));
const bytes=toBytes(big,null,1);
console.log(bytes.length,bytes.equals(Buffer.from(JSON.stringify(big,null,1))));
let sum=0;for(const b of bytes)sum=(sum*31+b)%1000003;console.log(sum);
let deep=[];for(let i=0;i<1000;i++)deep=[deep,{k:i}];
console.log(toBytes(deep).equals(Buffer.from(JSON.stringify(deep))));
let deeper=[];for(let i=0;i<1000000;i++)deeper=[deeper];
const outcome=(f)=>{try{f();return 'ok'}catch(e){return e.name}};
// Node.js serializes this; Nona throws a RangeError for both. Either way the two agree.
console.log(outcome(()=>JSON.stringify(deeper))===outcome(()=>toBytes(deeper)));
run({ok:1});
`,
        false,
    ));

test("JSON.stringify and stringifyToBuffer give distinct cycle and BigInt messages (#508)", () => {
    const { native, oracle: expected } = runModulesOnHost(
        {
            "main.mjs":
                nona +
                `
const msg=(f)=>{try{f();return 'no error'}catch(e){return e.name+': '+(e.message.startsWith('Converting circular structure to JSON')?'circular':e.message)}};
const o={};o.self=o;
const a=[];a.push({x:a});
for(const f of [JSON.stringify,toBytes]){
    console.log(msg(()=>f(o)));
    console.log(msg(()=>f(a)));
    console.log(msg(()=>f({n:1n})));
    console.log(msg(()=>f([Object(2n)])));
}
`,
        },
        "main.mjs",
        {
            gcStress: true,
            oracleSource: `import {Buffer} from 'node:buffer';\n${oracle}
const msg=(f)=>{try{f();return 'no error'}catch(e){return e.name+': '+(e.message.startsWith('Converting circular structure to JSON')?'circular':e.message)}};
const o={};o.self=o;
const a=[];a.push({x:a});
for(const f of [JSON.stringify,toBytes]){
    console.log(msg(()=>f(o)));
    console.log(msg(()=>f(a)));
    console.log(msg(()=>f({n:1n})));
    console.log(msg(()=>f([Object(2n)])));
}
`,
        },
    );
    assert.equal(native.error, undefined);
    assert.equal(native.status, 0, native.stderr);
    assert.match(
        expected,
        /^TypeError: circular\nTypeError: circular\nTypeError: Do not know how to serialize a BigInt\n/,
    );
    assert.equal(native.stdout, expected);
});
