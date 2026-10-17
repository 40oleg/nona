import { test } from "node:test";
import assert from "node:assert/strict";
import { runOracle } from "./helpers/oracle.js";
import { runNative } from "./helpers/native.js";
import { lex } from "../src/frontend/lexer.js";
import { parse } from "../src/frontend/parser.js";
import { bind } from "../src/frontend/binder.js";
import { lower } from "../src/ir/lower.js";
import { generate } from "../src/backend/x64/codegen.js";
import { runOnHost } from "./helpers/host.js";
import { linkHost } from "./helpers/program.js";

const cases: [string, string][] = [
    [
        "Error call and construct",
        'let a=Error("hello"),b=new Error(7);console.log(a.name,a.message,String(a),b.message,String(b),a!==b,a instanceof Error);',
    ],
    [
        "native error family",
        'let types=[EvalError,RangeError,ReferenceError,SyntaxError,TypeError,URIError];for(let i=0;i<types.length;i++){let C=types[i],e=new C("x");console.log(C.name,C.length,e.name,String(e),e instanceof C,e instanceof Error,Object.getPrototypeOf(C)===Error);}',
    ],
    [
        "undefined message omitted",
        'let a=Error(),b=Error(undefined),c=Error("");console.log(a.hasOwnProperty("message"),b.hasOwnProperty("message"),c.hasOwnProperty("message"),String(a),String(c));',
    ],
    [
        "message descriptor",
        'let e=Error("x"),d=Object.getOwnPropertyDescriptor(e,"message");console.log(d.value,d.writable,d.enumerable,d.configurable,Object.keys(e).length);e.message=7;console.log(String(e));delete e.message;console.log(String(e));',
    ],
    [
        "prototype descriptors and tags",
        'console.log(Object.getOwnPropertyNames(Error.prototype).join(),Object.getOwnPropertyNames(TypeError.prototype).join());console.log(Object.prototype.toString.call(Error.prototype),Object.prototype.toString.call(Error("x")),Object.prototype.toString.call(TypeError("x")));let d=Object.getOwnPropertyDescriptor(Error,"prototype");console.log(d.writable,d.enumerable,d.configurable);',
    ],
    [
        "generic tostring defaults",
        'let f=Error.prototype.toString;console.log(f.call({}),f.call({name:"",message:"x"}),f.call({name:"A",message:""}),f.call({name:null,message:null}));',
    ],
    [
        "tostring getter and conversion order",
        'let n={toString(){console.log("name conversion");return "N";}},o={get name(){console.log("name");return n;},get message(){console.log("message");return {toString(){console.log("message conversion");return "M";}};}};console.log(Error.prototype.toString.call(o));',
    ],
    [
        "constructor coercion and throw",
        'try{Error({toString(){throw 7;}});}catch(e){console.log(e);}let e=TypeError({toString(){return ""+42;}});console.log(String(e));',
    ],
    [
        "throw error through finally and gc",
        'try{try{throw new RangeError(""+42);}finally{for(let i=0;i<30;i++){({x:""+i});}}}catch(e){console.log(e.name,e.message,e instanceof Error);}',
    ],
    [
        "bound error constructor",
        'let C=TypeError.bind(null,"bound");let e=new C();console.log(String(e),e instanceof C,e instanceof TypeError,e instanceof Error);',
    ],
    [
        "prototype properties keep managed values alive",
        'Error.prototype.message=""+42;Error.prototype.name={toString(){return "custom";}};for(let i=0;i<30;i++){({x:""+i});}console.log(String(Error()));',
    ],
    [
        "constructors mutable and shadowable",
        'let original=TypeError;TypeError=function(){return 7;};console.log(TypeError(),original("x").name);function f(Error){return Error;}console.log(f(3));',
    ],
    [
        "constructor own message bypasses inherited setter",
        'Object.defineProperty(Error.prototype,"message",{set(v){throw 1;},configurable:true});let e=Error("x");console.log(e.message,e.hasOwnProperty("message"));',
    ],
    [
        "name conversion occurs before reading message",
        'let o={name:{toString(){throw 7;}},get message(){console.log("bad");return "x";}};try{Error.prototype.toString.call(o);}catch(e){console.log(e);}',
    ],
    [
        "native error prototype retains mutated object through gc",
        'TypeError.prototype.message={toString(){return "ok";}};for(let i=0;i<30;i++){({x:""+i});}console.log(String(TypeError()));',
    ],
];
for (const [name, source] of cases)
    test("Error objects: " + name, () => {
        const expected = runOracle(source);
        const result = runNative(
            linkHost(
                generate(lower(bind(parse(lex(source)))), { gcStress: true }),
            ),
        );
        assert.equal(result.error, undefined);
        assert.equal(result.status, 0, result.stderr.toString());
        assert.equal(result.stdout.toString(), expected.stdout);
    });

// V8 stack trace API with placeholder call sites (#298).
const depdStyle = `
function getStack() {
    var limit = Error.stackTraceLimit;
    var obj = {};
    var prep = Error.prepareStackTrace;
    Error.prepareStackTrace = function (o, stack) { return stack; };
    Error.stackTraceLimit = Math.max(10, limit);
    Error.captureStackTrace(obj);
    var stack = obj.stack.slice(1);
    Error.prepareStackTrace = prep;
    Error.stackTraceLimit = limit;
    return stack;
}
function callSiteLocation(site) {
    return [site.getFileName(), site.getLineNumber(), site.getColumnNumber(), site.isEval(), site.getEvalOrigin(), site.getFunctionName()];
}
`;
const stackCases: [string, string][] = [
    [
        "limit and function shape",
        'console.log(Error.stackTraceLimit, typeof Error.captureStackTrace, Error.captureStackTrace.length);Error.stackTraceLimit=3;console.log(Error.stackTraceLimit);let d=Object.getOwnPropertyDescriptor(Error,"stackTraceLimit");console.log(d.writable,d.configurable);try{Error.captureStackTrace(1);}catch(e){console.log(e instanceof TypeError);}',
    ],
    [
        "plain object and error header",
        'let o={};Error.captureStackTrace(o);let d=Object.getOwnPropertyDescriptor(o,"stack");console.log(typeof o.stack,d.enumerable,d.configurable,Object.keys(o).length);let e=new TypeError("bad");Error.captureStackTrace(e);console.log(typeof e.stack,e.stack.split("\\n")[0]);',
    ],
    [
        "prepareStackTrace receives call sites",
        'Error.prepareStackTrace=(o,s)=>s;let t={};Error.captureStackTrace(t);console.log(Array.isArray(t.stack),t.stack.length>=3);let s=t.stack[0];for(const m of ["getThis","getTypeName","getFunction","getFunctionName","getMethodName","getFileName","getLineNumber","getColumnNumber","getEvalOrigin","isToplevel","isEval","isNative","isConstructor","isAsync","isPromiseAll","getPromiseIndex","getScriptNameOrSourceURL","toString"])console.log(m,typeof s[m]);Error.stackTraceLimit=0;let z={};Error.captureStackTrace(z);console.log(z.stack.length);',
    ],
    [
        "depd style call site walk",
        depdStyle +
            "var stack = getStack();console.log(Array.isArray(stack), stack.length >= 2, typeof callSiteLocation(stack[1])[0], typeof Error.prepareStackTrace);",
    ],
];
for (const [name, source] of stackCases)
    test("Error stack API: " + name, () => {
        const expected = runOracle(source);
        const result = runOnHost(source);
        assert.equal(result.error, undefined);
        assert.equal(result.status, 0, result.stderr.toString());
        // The shape is deterministic; Node.js prints real locations for the rest.
        if (name !== "depd style call site walk")
            assert.equal(result.stdout, expected.stdout);
    });

test("Error stack API: placeholder frames", () => {
    const source =
        depdStyle +
        "var s = getStack();console.log(s.length, JSON.stringify(callSiteLocation(s[1])), String(s[0]), Error.stackTraceLimit);";
    const result = runOnHost(source);
    assert.equal(result.status, 0, result.stderr.toString());
    assert.equal(
        result.stdout.trim(),
        "9 [null,null,null,false,null,null] <anonymous> 10",
    );
});
