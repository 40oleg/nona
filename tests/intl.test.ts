import { test } from "node:test";
import assert from "node:assert/strict";
import { runOnHost } from "./helpers/host.js";
import { runOracle } from "./helpers/oracle.js";
import { collectSourceUsage, lex } from "../src/frontend/lexer.js";

// Nona's own Intl for the en locale (#300), compared with Node.js for en-US
// under GC stress. The programs name their locale: the host's default locale
// of Node.js need not be en-US.
const programs: Record<string, string> = {
    "NumberFormat decimal grouping, fractions and significant digits": `
const f=(o,v)=>new Intl.NumberFormat("en-US",o).format(v);
console.log(f({},1234567.891),f({},0.0005),f({},1.0005),f({},-0),f({},NaN),f({},-Infinity),f({},1e21),f({},0.1+0.2),f({},5e-7));
console.log(f({maximumFractionDigits:2},1.005),f({maximumFractionDigits:2},2.675),f({minimumFractionDigits:2},1),f({minimumFractionDigits:2,maximumFractionDigits:4},1.23456));
console.log(f({maximumSignificantDigits:2},123456),f({maximumSignificantDigits:3},0.000456789),f({minimumSignificantDigits:4},1),f({maximumSignificantDigits:2},99.9),f({maximumSignificantDigits:21},0.1));
console.log(f({minimumIntegerDigits:5},12.5),f({useGrouping:false},1234567),f({useGrouping:"min2"},1234),f({useGrouping:"min2"},12345),f({maximumFractionDigits:0},0.5),f({maximumFractionDigits:0},-0.5));
console.log(f({roundingMode:"floor",maximumFractionDigits:0},-1.5),f({roundingMode:"halfEven",maximumFractionDigits:0},2.5),f({roundingMode:"trunc",maximumFractionDigits:1},1.99),f({roundingIncrement:5,maximumFractionDigits:2,minimumFractionDigits:2},1.234));
console.log(f({roundingPriority:"lessPrecision",maximumSignificantDigits:2,maximumFractionDigits:2},1.234),f({trailingZeroDisplay:"stripIfInteger",minimumFractionDigits:2},5),f({},1.5e300).length);`,
    "NumberFormat percent and currencies": `
const f=(o,v)=>new Intl.NumberFormat("en-US",o).format(v),c=(currency,display,v)=>f({style:"currency",currency,currencyDisplay:display},v);
console.log(f({style:"percent"},0.256),f({style:"percent",maximumFractionDigits:1},0.12345),f({style:"percent"},NaN),f({style:"percent"},-0.5));
for(const code of ["USD","EUR","GBP","JPY","CAD","CHF","KWD","XYZ","usd"])console.log(code,c(code,"symbol",1234.5),c(code,"narrowSymbol",-1),c(code,"code",1),c(code,"name",1),c(code,"name",2));
console.log(f({style:"currency",currency:"USD",currencyDisplay:"name",maximumFractionDigits:0},1),f({style:"currency",currency:"USD"},NaN),f({style:"currency",currency:"USD"},-0));
console.log(f({style:"currency",currency:"EUR",currencySign:"accounting"},-5),f({style:"currency",currency:"USD",currencySign:"accounting",signDisplay:"always"},1),f({style:"currency",currency:"CHF",currencySign:"accounting"},-1));`,
    "NumberFormat compact, scientific and signs": `
const f=(o,v)=>new Intl.NumberFormat("en-US",o).format(v);
console.log([999999,999.9,1234,123456,1e15,1.5e16,-0.0012,0.5,0,-1500].map(v=>f({notation:"compact"},v)).join(" "));
console.log([1234567,1500,1e9,2.5e12].map(v=>f({notation:"compact",compactDisplay:"long"},v)).join(" "),f({style:"currency",currency:"EUR",notation:"compact"},1234567),f({style:"currency",currency:"USD",currencyDisplay:"name",notation:"compact",compactDisplay:"long"},1234567));
console.log([123456,0.000123,0,-1,9.9996].map(v=>f({notation:"scientific"},v)).join(" "),[123456,-0.5,0.001234].map(v=>f({notation:"engineering"},v)).join(" "));
for(const signDisplay of ["auto","always","never","exceptZero","negative"])console.log(signDisplay,[0,-0,1,-1,-0.0001,NaN].map(v=>f({signDisplay},v)).join(" "));`,
    "NumberFormat formatToParts, inputs, bound format and resolvedOptions": `
const p=(o,v)=>JSON.stringify(new Intl.NumberFormat("en-US",o).formatToParts(v));
console.log(p({},-1234.5),p({style:"currency",currency:"USD",currencySign:"accounting"},-1234.5),p({style:"currency",currency:"USD",currencyDisplay:"code"},-1));
console.log(p({notation:"scientific"},-0.00012),p({notation:"compact",compactDisplay:"long"},1500),p({style:"percent"},NaN),p({style:"currency",currency:"CHF",currencyDisplay:"name"},1));
const nf=new Intl.NumberFormat("en-US");
console.log(nf.format(12345678901234567890123n),nf.format(-5n),nf.format("1234.56789012345678901234"),nf.format(" 0x1F "),nf.format("abc"),nf.format("-0"),nf.format(""),nf.format({valueOf(){return 42}}));
const format=nf.format;console.log(format(1234),format===nf.format,format.name==="",format.length,"prototype" in format,[1000,2000].map(format).join(" "));
for(const o of [{},{style:"currency",currency:"usd"},{maximumSignificantDigits:3},{useGrouping:true},{style:"percent"},{notation:"compact"}])console.log(JSON.stringify(new Intl.NumberFormat("en-US",o).resolvedOptions()));
for(const o of [{minimumFractionDigits:3,maximumFractionDigits:2},{maximumFractionDigits:101},{style:"currency"},{currency:"US"},{style:"bogus"},{roundingIncrement:3},{useGrouping:"bogus"}])try{new Intl.NumberFormat("en-US",o);console.log("ok")}catch(e){console.log(e.name)}
const desc=Object.getOwnPropertyDescriptor(Intl.NumberFormat.prototype,"format");
console.log(desc.get.name,typeof desc.set,Intl.NumberFormat.length,Intl.NumberFormat.name,Intl.NumberFormat("en-US").format(1),Object.prototype.toString.call(nf),Intl.NumberFormat.prototype[Symbol.toStringTag]);
class Sub extends Intl.NumberFormat{}const sub=new Sub("en-US");console.log(sub instanceof Sub,sub.format(1e6));
try{Intl.NumberFormat.prototype.format}catch(e){console.log(e.name)}try{Intl.NumberFormat.prototype.resolvedOptions.call({})}catch(e){console.log(e.name)}`,
    "PluralRules en cardinal and ordinal rules": `
const values=[0,1,-1,1.5,2,3,4,11,12,13,21,22,23,101,111,112,1.0001,"1",NaN,Infinity];
for(const o of [{},{type:"ordinal"},{minimumFractionDigits:1}]){const pr=new Intl.PluralRules("en-US",o);console.log(values.map(v=>pr.select(v)).join(),JSON.stringify(pr.resolvedOptions()));}
try{Intl.PluralRules("en-US")}catch(e){console.log(e.name)}try{new Intl.PluralRules("en-US",{type:"bogus"})}catch(e){console.log(e.name)}
console.log(Object.prototype.toString.call(new Intl.PluralRules("en-US")),Intl.PluralRules.prototype.select.length,Intl.PluralRules.supportedLocalesOf(["en-US"]).join());`,
    "Collator sorts mixed-case and accented words": `
const words=["r\\u00e9sum\\u00e9","resume","Resume","R\\u00e9sum\\u00e9","apple","Apple","\\u00e4pple","Zebra","zebra","10","9","a10","a9","a-b","ab","a b","\\u00e9clair","eclair","co-op","coop","\\u00df","ss","stra\\u00dfe","strasse","\\u00c5ngstr\\u00f6m","angstrom","\\u00d8","o","\\u0153uvre","oeuvre","_x","$x","1x","Ab","aB","AB","x2","x02","x10","\\u0141\\u00d3D\\u0179","lodz","\\u00f1","n","A\\u030a","\\u041c\\u043e\\u0441\\u043a\\u0432\\u0430","\\u03b1\\u03b8\\u03b7\\u03bd\\u03b1"];
for(const o of [{},{numeric:true},{caseFirst:"upper"},{sensitivity:"base"},{sensitivity:"accent"},{sensitivity:"case"},{ignorePunctuation:true}]){const c=new Intl.Collator("en-US",o);console.log(words.slice().sort(c.compare).join("|"));console.log(JSON.stringify(c.resolvedOptions()));}
const c=new Intl.Collator("en-US"),cmp=c.compare;console.log(cmp("a","b"),cmp("b","a"),cmp("a","a"),cmp("\\u00c5","A\\u030a"),cmp.length,cmp.name==="",cmp===c.compare,Intl.Collator("en-US").compare("a","B"));
for(const s of ["base","accent","case","variant"]){const k=new Intl.Collator("en-US",{sensitivity:s});console.log(s,["a","A","\\u00e1","\\u00c1","b"].map(x=>["a","A","\\u00e1","\\u00c1","b"].map(y=>k.compare(x,y)).join(",")).join(" "));}
console.log(JSON.stringify(new Intl.Collator("en-u-kn-true").resolvedOptions()),JSON.stringify(new Intl.Collator("en-US",{usage:"search"}).resolvedOptions()));`,
    "Collator under GC stress": `
const c=new Intl.Collator("en-US"),words=["b","á","A","a","B"];console.log(words.sort(c.compare).join(),c.compare("Å","Å"),new Intl.Collator("en-US",{numeric:true}).compare("x10","x9"),new Intl.Collator("en-US",{sensitivity:"base"}).compare("a","Á"));`,
    "toLocaleString and localeCompare delegate to Intl": `
console.log((1234.5).toLocaleString("en-US"),(1234.5).toLocaleString("en-US",{style:"currency",currency:"EUR"}),(0.256).toLocaleString("en-US",{style:"percent"}),(12345n).toLocaleString("en-US"),(-5n).toLocaleString("en-US",{style:"currency",currency:"USD"}));
console.log([1234.5,null,5678].toLocaleString("en-US"),"a".localeCompare("B"),"r\\u00e9sum\\u00e9".localeCompare("resume","en-US",{sensitivity:"base"}),"a10".localeCompare("a9","en-US",{numeric:true}),["b","a","\\u00e1","A"].sort((x,y)=>x.localeCompare(y,"en-US")).join());
for(const [o,n] of [[Number.prototype,"toLocaleString"],[BigInt.prototype,"toLocaleString"],[String.prototype,"localeCompare"]]){const d=Object.getOwnPropertyDescriptor(o,n);console.log(n,d.value.name,d.value.length,d.writable,d.enumerable,d.configurable,"prototype" in d.value);}
try{Number.prototype.toLocaleString.call("1")}catch(e){console.log(e.name)}try{String.prototype.localeCompare.call(null,"a")}catch(e){console.log(e.name)}try{(1).toLocaleString("en_US")}catch(e){console.log(e.name)}`,
    "getCanonicalLocales validates and canonicalizes tags": `
console.log(Intl.getCanonicalLocales(["EN-us","en-latn-us-u-ca-gregory-nu-latn","en-u-kn-true","iw","en-variant-1abc","zh-hant-tw","en-x-PRIVATE","de-u-kn-co-phonebk","en-t-de","EN-US","en-b-cc-a-bb"]).join());
console.log(Intl.getCanonicalLocales().length,Intl.getCanonicalLocales("EN").join(),Intl.getCanonicalLocales({length:1,0:"en"}).join(),Intl.getCanonicalLocales.length);
for(const v of ["en_US","root","en-","","abcd","en-gb-oed","i-klingon","en-u","en-a-bb-a-cc","en-variant-variant","x-foo",null,5,[5],[null]])try{console.log(Intl.getCanonicalLocales(v).join())}catch(e){console.log(String(v),e.name)}
console.log(Object.prototype.toString.call(Intl),typeof Intl,Object.getOwnPropertyDescriptor(globalThis,"Intl").enumerable,Object.getOwnPropertyDescriptor(globalThis,"Intl").writable,Object.keys(Intl).length);`,
};
// Sorting with the collator runs too many prelude operations to collect
// before each one; "Collator under GC stress" covers its rooting.
const withoutGcStress = new Set([
    "Collator sorts mixed-case and accented words",
]);
for (const [name, source] of Object.entries(programs))
    test(`Intl: ${name}`, () => {
        const expected = runOracle(source).stdout;
        const run = runOnHost(source, { gcStress: !withoutGcStress.has(name) });
        assert.equal(run.error, undefined);
        assert.equal(run.status, 0, run.stderr);
        assert.equal(run.stdout, expected);
    });

// Only en and en-US are available: other locales fall back to en-US, which
// differs from Node.js and its full ICU data.
test("Intl: other locales fall back to en", () => {
    const run = runOnHost(
        `console.log(new Intl.NumberFormat("de-DE").resolvedOptions().locale,new Intl.Collator("fr").resolvedOptions().locale,new Intl.PluralRules("en-GB").resolvedOptions().locale,new Intl.NumberFormat().resolvedOptions().locale);
console.log((1234.5).toLocaleString("de-DE"),(1234.5).toLocaleString(),Intl.NumberFormat.supportedLocalesOf(["de-DE","en-GB","en-US","EN-latn"]).join(),Intl.Collator.supportedLocalesOf("fr").length);
console.log(new Intl.NumberFormat("en-u-nu-arab").resolvedOptions().numberingSystem,new Intl.Collator("en-GB-u-kn").resolvedOptions().locale);`,
    );
    assert.equal(run.status, 0, run.stderr);
    assert.equal(
        run.stdout,
        "en-US en-US en en-US\n1,234.5 1,234.5 en-GB,en-US,en-Latn 0\nlatn en-u-kn\n",
    );
});

test("Intl: only programs that use it link the prelude", () => {
    const usage = (source: string) =>
        collectSourceUsage(() => lex(source)).usage;
    for (const source of [
        'console.log("hi")',
        "console.log((5).toFixed(2))",
        "const date = new Date(0); console.log(date.toISOString())",
    ])
        assert.equal(usage(source).preludes.intl, false, source);
    for (const source of [
        "new Intl.NumberFormat()",
        "x.toLocaleString()",
        "d.toLocaleDateString()",
        "d.toLocaleTimeString()",
        "a.localeCompare(b)",
        'globalThis["Intl"]',
        'n["toLocaleString"]()',
    ])
        assert.equal(usage(source).preludes.intl, true, source);
    // Number formatting does not need the normalization tables; Intl and
    // localeCompare (the collator) do.
    assert.equal(usage("x.toLocaleString()").unicodeNormalization, false);
    assert.equal(usage("Intl.Collator").unicodeNormalization, true);
    assert.equal(usage("a.localeCompare(b)").unicodeNormalization, true);
});
