import { test } from "node:test";
import assert from "node:assert/strict";
import { runOnHost } from "./helpers/host.js";
import { runOracle } from "./helpers/oracle.js";
import { compile } from "../src/compiler.js";

// Strict equality against an undefined, null, Boolean or Number constant is
// an inline tag test (src/backend/x64/operations.ts; #146 item 23, first
// step). Programs run under GC stress against Node.js; the assembly check
// confirms that rt.strictEquals is no longer called for such comparisons.
const agree = (source: string) => {
    const run = runOnHost(source);
    assert.equal(run.status, 0, run.stderr);
    assert.equal(run.stdout, runOracle(source).stdout);
};

test("strict equality with constants keeps JavaScript semantics", () =>
    agree(String.raw`
const out=[];
let rope='';for(let i=0;i<40;i++)rope+='ab';
const values=[undefined,null,true,false,0,-0,1,-1,1.5,NaN,Infinity,-Infinity,'',  '0','1','true','null',0n,1n,{},[],[0],Symbol('s'),rope,function(){},new Number(1),new Boolean(false),{valueOf(){return 1}}];
function eqs(v){return [v===undefined,v===null,v===true,v===false,v===0,v===-0,v===1,v===-1,v===1.5,v===NaN,v===Infinity,v===-Infinity].map(Number).join('')}
function nes(v){return [undefined!==v,null!==v,true!==v,false!==v,0!==v,-0!==v,1!==v,NaN!==v,Infinity!==v].map(Number).join('')}
function branches(v){let r='';if(v===undefined)r+='u';if(v===null)r+='n';if(v===true)r+='t';if(false===v)r+='f';if(v===0)r+='0';if(v!==1)r+='!';if(NaN===v)r+='N';return r}
function sw(v){switch(v){case 0:return 'zero';case 1:return 'one';case 2:return 'two';case 3:return 'three';case null:return 'null';case undefined:return 'undef';case true:return 'true';case 1.5:return 'half';default:return 'other'}}
function fall(v){let r='';switch(v){case 1:r+='1';case 2:r+='2';break;case 3:r+='3';default:r+='d';case 4:r+='4'}return r}
for(const v of values)out.push(eqs(v)+' '+nes(v)+' '+branches(v)+' '+sw(v)+' '+fall(v));
for(const v of [1,2,3,4,5,'1',1n,-0,2.0])out.push(fall(v));
console.log(out.join('\n'));
`));

test("comparisons with undefined, null, Boolean and Number constants call no runtime routine", () => {
    const source =
        "function f(x){if(x===null)return 1;if(x===undefined)return 2;if(x!==true)return 3;if(x===0)return 4;return 5}\n" +
        'function g(x){return x==="a"}\nconsole.log(f(1),g("a"));\n';
    const result = compile(source, {
        fileName: "/app.js",
        target: "linux-x64",
        printAsm: true,
    });
    assert.ok(result.ok);
    const lines = result.assembly!.split("\n");
    const body = (name: string) =>
        lines
            .slice(lines.indexOf(name + ":"), lines.indexOf(name + ".end:"))
            .join("\n");
    assert.doesNotMatch(body("js.fn.0"), /rt\.strictEquals/);
    assert.match(
        body("js.fn.1"),
        /call rt\.strictEquals/,
        "string constants still use the runtime",
    );
});
