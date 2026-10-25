import { test } from "node:test";
import assert from "node:assert/strict";
import { runOracle } from "./helpers/oracle.js";
import { runOnHost, runModulesOnHost } from "./helpers/host.js";
import {
    cases,
    blobStreamCases,
    streamOracle,
} from "./helpers/buffer-cases.js";

for (const [index, body] of blobStreamCases.entries()) {
    test("Blob stream and object URL Node oracle " + index, () => {
        const source = `import {resolveObjectURL} from 'node:buffer';` + body;
        const { native } = runModulesOnHost({ "main.mjs": source }, "main.mjs");
        assert.equal(native.status, 0, JSON.stringify(native));
        assert.equal(native.stdout, streamOracle(body));
    });
}

test("Buffer module aliases share global constructors and helpers", () => {
    const body = `console.log(Buffer===globalThis.Buffer,Buffer===bare.Buffer,Buffer===nona.Buffer,buffer.Buffer===Buffer,Blob===globalThis.Blob,File===globalThis.File);console.log(bare===node,nona===node);console.log(isAscii(Buffer.from('abc')),isAscii(Buffer.from('é')),isUtf8(Buffer.from([0xff])),isUtf8(Buffer.from('é')),btoa('é'),atob('6Q=='));console.log(transcode(Buffer.from('é😀'),'utf8','ascii').toString(),resolveObjectURL('blob:nodedata:missing'));`;
    const { native } = runModulesOnHost(
        {
            "main.mjs":
                `import buffer,{Buffer,Blob,File,isAscii,isUtf8,btoa,atob,transcode,resolveObjectURL} from 'node:buffer';import * as node from 'node:buffer';import * as bare from 'buffer';import * as nona from 'nona:buffer';` +
                body,
        },
        "main.mjs",
    );
    const oracle = runOracle(
        `var buffer=require('node:buffer'),bare=buffer,nona=buffer,node=buffer;var {Buffer,Blob,File,isAscii,isUtf8,btoa,atob,transcode,resolveObjectURL}=buffer;` +
            body,
    );
    assert.equal(native.status, 0, JSON.stringify(native));
    assert.equal(native.stdout, oracle.stdout);
});

test("Blob immutable data and asynchronous methods match Node", () => {
    const source = `var a=new Uint8Array([65,66]);var b=new Blob([a,'é'],{type:'TEXT/PLAIN'});a.fill(0);Promise.all([b.text(),b.arrayBuffer(),b.bytes(),b.slice(1,3).text()]).then(function(v){console.log(v[0],Buffer.from(v[1]).toString('hex'),Buffer.from(v[2]).toString('hex'),v[3]);v[2][0]=0;b.text().then(function(s){console.log(s)})});`;
    const native = runOnHost(source, { gcStress: true });
    assert.equal(native.status, 0, JSON.stringify(native));
    assert.equal(native.stdout, runOracle(source).stdout);
});

for (const [index, source] of cases.entries()) {
    test("Buffer Node oracle " + index, () => {
        const oracle = runOracle(source);
        const native = runOnHost(source, { gcStress: true });
        assert.equal(native.status, 0, JSON.stringify(native));
        assert.equal(native.stdout, oracle.stdout);
    });
}

// Buffer.from(string) and Buffer.byteLength(string) in UTF-8 call the native
// encoder directly (#155); the bytes must stay those of Node.js.
test("Buffer.from and byteLength of strings in UTF-8 match Node", () => {
    const source = `
var user={id:42,name:'Ada Lovelace',email:'ada@example.com',roles:['admin','dev'],active:true};
var rope='';for(var i=0;i<40;i++)rope+=i%3?'界':'a';
var strings=['','a','plain ascii text',JSON.stringify(user),JSON.stringify({name:'Ада',note:'日本語 ✓',emoji:'😀'}),'\\ud800','\\udc00x','a\\ud83d','\\ud83d\\ude00\\ud83d',rope,'\\0nul\\0','é'.repeat(3000),String.fromCharCode(0x7f,0x80,0x7ff,0x800,0xffff)];
strings.forEach(function(s){
 var a=Buffer.from(s),b=Buffer.from(s,'utf8'),c=Buffer.from(s,'utf-8');
 console.log(a.length,Buffer.byteLength(s),Buffer.byteLength(s,'utf8'),a.toString('hex').slice(0,80),a.equals(b)&&a.equals(c),a instanceof Buffer,a.toString()===s);
});
console.log(Buffer.from(JSON.stringify(user)).toString(),Buffer.from('aGk=','base64').toString(),Buffer.from('6869','hex').toString(),Buffer.byteLength('aGk=','base64'),Buffer.from('é','latin1').length);
`;
    // Without GC stress: collecting before every operation made this run take
    // over a minute on the arm64 runners; the Buffer oracle cases above cover
    // rooting.
    const native = runOnHost(source, { gcStress: false });
    assert.equal(native.status, 0, JSON.stringify(native));
    assert.equal(native.stdout, runOracle(source).stdout);
});

// atob and btoa are writable, configurable, non-enumerable globals (#488).
test("global atob and btoa match Node", () => {
    const source = `
var show=function(f){try{return String(f())}catch(e){return e.constructor.name+':'+e.name+':'+e.code+':'+(e instanceof DOMException)}};
console.log(typeof atob,typeof btoa,atob.name,btoa.name,atob.length,btoa.length);
['atob','btoa'].forEach(function(k){var d=Object.getOwnPropertyDescriptor(globalThis,k);console.log(k,d.writable,d.configurable)});
console.log(btoa('hi'),atob('aGk='),btoa(''),atob(''),atob(' aG k=\\n'),atob('aGk'));
var all='';for(var i=0;i<256;i++)all+=String.fromCharCode(i);
console.log(atob(btoa(all))===all,btoa(all).length);
console.log(show(function(){return atob('a')}),show(function(){return atob('***')}),show(function(){return btoa('€')}));
`;
    const native = runOnHost(source, { gcStress: true });
    assert.equal(native.status, 0, JSON.stringify(native));
    assert.equal(native.stdout, runOracle(source).stdout);
    // Node.js lists them as enumerable; the issue asks for non-enumerable.
    const flags = runOnHost(
        "console.log(['atob','btoa'].map(function(k){return Object.getOwnPropertyDescriptor(globalThis,k).enumerable}).join())",
    );
    assert.equal(flags.stdout, "false,false\n");
});
