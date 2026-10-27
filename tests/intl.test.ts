import { test } from "node:test";
import assert from "node:assert/strict";
import { runOnHost } from "./helpers/host.js";
import { runOracle } from "./helpers/oracle.js";
import { collectSourceUsage, lex } from "../src/frontend/lexer.js";
import { parse } from "../src/frontend/parser.js";

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
    "NumberFormat under GC stress": `
const f=(o,v)=>new Intl.NumberFormat("en-US",o).format(v);
console.log(f({style:"percent",maximumFractionDigits:1},0.12345),f({style:"currency",currency:"EUR"},1234.5),f({style:"currency",currency:"JPY",currencyDisplay:"name"},2),f({style:"currency",currency:"CHF",currencySign:"accounting"},-1),f({style:"currency",currency:"XYZ",currencyDisplay:"narrowSymbol"},1));
console.log(f({notation:"compact"},1234),f({notation:"compact",compactDisplay:"long"},2.5e12),f({style:"currency",currency:"USD",notation:"compact"},1234567),f({notation:"scientific"},-0.000123),f({notation:"engineering"},123456),f({signDisplay:"exceptZero"},-0.0001),f({signDisplay:"always"},0));`,
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
// GC stress collects before every operation, prelude operations included.
// Programs that build dozens of formats, or sort with the collator, take
// too long that way for the test's time limit on a loaded CI runner; the
// "under GC stress" programs cover the rooting of the same paths.
const withoutGcStress = new Set([
    "NumberFormat percent and currencies",
    "NumberFormat compact, scientific and signs",
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

// DateTimeFormat and the Date methods, compared with Node.js in the UTC time
// zone (Nona's local time zone is UTC). Each DateTimeFormat runs a few
// thousand prelude operations to resolve its pattern, too many to collect
// before each one in programs that build dozens of formats; "DateTimeFormat
// under GC stress" covers the rooting of every method.
const dateTimePrograms: Record<string, string> = {
    "DateTimeFormat under GC stress": `
const d=Date.UTC(2026,0,5,13,4,5,9),f=new Intl.DateTimeFormat("en-US",{weekday:"short",month:"long",day:"numeric",hour:"numeric",minute:"2-digit",fractionalSecondDigits:2,timeZoneName:"short",timeZone:"UTC"}),s=new Intl.DateTimeFormat("en-US",{dateStyle:"full",timeStyle:"short",timeZone:"+05:30"});
console.log(f.format(d),"|",s.format(d),"|",JSON.stringify(f.formatToParts(d)),JSON.stringify(f.resolvedOptions()),JSON.stringify(s.resolvedOptions()));
console.log(JSON.stringify(s.formatRangeToParts(d,d+3600e3)),"|",[0,1e12].map(f.format).join(" | "));
const x=new Date(d);console.log(x.toLocaleTimeString("en-US",{timeZone:"UTC"}),"|",new Date(NaN).toLocaleString());`,
    "DateTimeFormat dateStyle and timeStyle": `
const S=[undefined,"full","long","medium","short"],dates=[Date.UTC(2026,0,5,13,4,5,9),Date.UTC(2026,9,16,0,0,0),Date.UTC(999,11,31,23,59,59),Date.UTC(-5,6,1,12,0,0)];
for(const dateStyle of S)for(const timeStyle of S){if(!dateStyle&&!timeStyle)continue;const f=new Intl.DateTimeFormat("en-US",{dateStyle,timeStyle,timeZone:"UTC"});console.log(dateStyle,timeStyle,dates.map(d=>f.format(d)).join(" | "));}
for(const hourCycle of ["h11","h12","h23","h24"])console.log(hourCycle,["short","medium","full"].map(timeStyle=>new Intl.DateTimeFormat("en-US",{timeStyle,dateStyle:"short",hourCycle,timeZone:"UTC"}).format(dates[1])).join(" | "));
console.log(new Intl.DateTimeFormat("en-US",{timeStyle:"medium",hour12:false,timeZone:"UTC"}).format(dates[0]),JSON.stringify(new Intl.DateTimeFormat("en-US",{dateStyle:"long",timeStyle:"short",timeZone:"UTC"}).resolvedOptions()));`,
    "DateTimeFormat component options": `
const d=Date.UTC(2026,0,5,13,4,5,9),old=Date.UTC(-44,2,15,9,30);
const options=[{},{year:"numeric"},{year:"2-digit",month:"2-digit",day:"2-digit"},{month:"long",day:"numeric"},{month:"narrow"},{weekday:"long",year:"numeric",month:"long",day:"numeric"},{weekday:"short",day:"numeric"},{weekday:"long",hour:"numeric"},{era:"short"},{era:"long",year:"numeric"},{month:"long",era:"long"},{year:"numeric",day:"numeric"},{hour:"numeric"},{hour:"2-digit",minute:"2-digit"},{minute:"2-digit"},{minute:"numeric",second:"numeric"},{hour:"numeric",second:"numeric"},{second:"numeric",fractionalSecondDigits:2},{fractionalSecondDigits:3},{minute:"numeric",fractionalSecondDigits:1},{hour:"numeric",minute:"numeric",timeZoneName:"short"},{timeZoneName:"long"},{year:"numeric",timeZoneName:"shortOffset"},{hour:"numeric",timeZoneName:"longOffset"},{month:"short",timeZoneName:"shortGeneric"},{dayPeriod:"long"},{hour:"numeric",dayPeriod:"short"},{dayPeriod:"narrow",minute:"numeric"},{month:"long",hour:"numeric",minute:"numeric"},{weekday:"long",era:"short",fractionalSecondDigits:2}];
for(const o of options){const f=new Intl.DateTimeFormat("en-US",{...o,timeZone:"UTC"});console.log(JSON.stringify(o),f.format(d),"|",f.format(old),"|",JSON.stringify(f.resolvedOptions()));}`,
    "DateTimeFormat hour cycles and day periods": `
const hours=[0,1,11,12,13,18,21,23].map(h=>Date.UTC(2026,0,5,h,0,0));
for(const o of [{hour12:true},{hour12:false},{hourCycle:"h11"},{hourCycle:"h12"},{hourCycle:"h23"},{hourCycle:"h24"},{hourCycle:"h23",hour12:true}]){const f=new Intl.DateTimeFormat("en-US",{hour:"numeric",minute:"numeric",...o,timeZone:"UTC"});console.log(JSON.stringify(o),hours.map(h=>f.format(h)).join(),f.resolvedOptions().hourCycle,f.resolvedOptions().hour12);}
for(const dayPeriod of ["narrow","short","long"])console.log(dayPeriod,hours.map(h=>new Intl.DateTimeFormat("en-US",{hour:"numeric",dayPeriod,timeZone:"UTC"}).format(h)).join());
for(const locale of ["en-u-hc-h23","en-US-u-hc-h11"])for(const o of [{},{hour12:true},{hour12:false}]){const r=new Intl.DateTimeFormat(locale,{hour:"numeric",...o,timeZone:"UTC"}).resolvedOptions();console.log(locale,JSON.stringify(o),r.locale,r.hourCycle);}`,
    "DateTimeFormat formatToParts and ranges": `
const d=Date.UTC(2026,0,5,13,4,5,9),p=(o,v)=>JSON.stringify(new Intl.DateTimeFormat("en-US",{...o,timeZone:"UTC"}).formatToParts(v));
console.log(p({dateStyle:"full",timeStyle:"full"},d));
console.log(p({weekday:"short",era:"short",year:"numeric",month:"short",day:"numeric",hour:"numeric",minute:"numeric",second:"numeric",fractionalSecondDigits:3,timeZoneName:"short"},d));
console.log(p({hour:"numeric",dayPeriod:"long"},d),p({hour:"numeric",second:"numeric"},d));
const steps=[0,1000,3600e3,12*3600e3,86400e3,40*86400e3,400*86400e3];
for(const o of [{},{hour:"numeric",minute:"numeric"},{hour:"numeric",hourCycle:"h23"},{dateStyle:"medium"},{dateStyle:"full"},{dateStyle:"medium",timeStyle:"short"},{timeStyle:"long"},{month:"long"},{weekday:"long"},{year:"numeric",month:"short"},{hour:"numeric",minute:"numeric",second:"numeric"}]){const f=new Intl.DateTimeFormat("en-US",{...o,timeZone:"UTC"});console.log(JSON.stringify(o),steps.map(s=>f.formatRange(d,d+s)).join(" | "));}
const r=new Intl.DateTimeFormat("en-US",{hour:"numeric",minute:"numeric",timeZone:"UTC"});console.log(JSON.stringify(r.formatRangeToParts(d,d+3600e3)),JSON.stringify(r.formatRangeToParts(d,d)));
console.log(JSON.stringify(new Intl.DateTimeFormat("en-US",{dateStyle:"medium",timeZone:"UTC"}).formatRangeToParts(d,d+86400e3)),new Intl.DateTimeFormat("en-US",{timeZone:"UTC"}).formatRange(d+86400e3,d));`,
    "DateTimeFormat time zones and fixed offsets": `
const d=Date.UTC(2026,0,5,13,4,5,9),names=["short","long","shortOffset","longOffset","shortGeneric","longGeneric"];
for(const timeZone of ["UTC","utc","+05:30","-08:00","+0100","-03"]){const r=new Intl.DateTimeFormat("en-US",{timeZone}).resolvedOptions().timeZone;console.log(timeZone,r,names.map(timeZoneName=>new Intl.DateTimeFormat("en-US",{timeZone,timeZoneName,hour:"numeric",minute:"numeric"}).format(d)).join(" | "),new Date(d).toLocaleString("en-US",{timeZone}));}
console.log(new Intl.DateTimeFormat("en-US",{timeZone:"+05:30",dateStyle:"full",timeStyle:"full"}).format(Date.UTC(2026,0,5,20,0)));`,
    "Date toLocaleString methods delegate to DateTimeFormat": `
const dates=[new Date(Date.UTC(2026,0,5,13,4,5,9)),new Date(Date.UTC(5,1,3)),new Date(Date.UTC(-271820,0,1)),new Date(8.64e15),new Date(NaN)];
for(const d of dates)console.log(d.toLocaleString("en-US",{timeZone:"UTC"}),"|",d.toLocaleDateString("en-US",{timeZone:"UTC"}),"|",d.toLocaleTimeString("en-US",{timeZone:"UTC"}),"|",d.toLocaleString("en-US"),"|",d.toLocaleDateString("en-US",{month:"long",day:"numeric",timeZone:"UTC"}));
const d=dates[0];console.log(d.toLocaleDateString("en-US",{hour:"numeric",timeZone:"UTC"}),"|",d.toLocaleTimeString("en-US",{year:"numeric",timeZone:"UTC"}),"|",d.toLocaleString("en-US",{dateStyle:"medium",timeZone:"UTC"}),"|",d.toLocaleTimeString("en-US",{timeStyle:"short",timeZone:"UTC"}),"|",d.toLocaleDateString("en-US",{dateStyle:"full",timeZone:"UTC"}),"|",d.toLocaleTimeString("en-US",{hour12:false,timeZone:"UTC"}));
for(const n of ["toLocaleString","toLocaleDateString","toLocaleTimeString"]){const p=Object.getOwnPropertyDescriptor(Date.prototype,n);console.log(n,p.value.name,p.value.length,p.writable,p.enumerable,p.configurable,"prototype" in p.value);}
for(const f of [()=>d.toLocaleDateString("en-US",{timeStyle:"short"}),()=>d.toLocaleTimeString("en-US",{dateStyle:"short"}),()=>Date.prototype.toLocaleString.call({}),()=>d.toLocaleString("en-US",{timeZone:"Mars/Phobos"})])try{console.log(f())}catch(e){console.log(e.name)}
console.log(new Date(NaN).toLocaleString("en-US",{timeZone:"Mars/Phobos"}));`,
    "DateTimeFormat errors, receivers and descriptors": `
const tryIt=f=>{try{console.log(f())}catch(e){console.log(e.name)}};
for(const o of [{dateStyle:"short",hour:"numeric"},{timeStyle:"short",fractionalSecondDigits:2},{dateStyle:"bogus"},{hourCycle:"h25"},{fractionalSecondDigits:4},{fractionalSecondDigits:0},{calendar:"x"},{timeZone:"Mars/Phobos"},{timeZone:"+24:00"},{weekday:"longer"},{timeZoneName:"bogus"}])tryIt(()=>new Intl.DateTimeFormat("en-US",o).resolvedOptions().locale);
const f=new Intl.DateTimeFormat("en-US",{timeZone:"UTC"});
tryIt(()=>f.format(NaN));tryIt(()=>f.format(8.64e15+1));tryIt(()=>f.formatRange(0));tryIt(()=>f.formatRange(0,NaN));tryIt(()=>f.formatToParts(Infinity));tryIt(()=>f.format(new Date(Date.UTC(2026,0,5))));tryIt(()=>f.format("2026-01-05"));tryIt(()=>f.format(1e12));tryIt(()=>f.format({valueOf(){return 0}}));
tryIt(()=>Intl.DateTimeFormat.prototype.format);tryIt(()=>Intl.DateTimeFormat.prototype.formatToParts.call({},0));tryIt(()=>Intl.DateTimeFormat.prototype.resolvedOptions.call(new Intl.NumberFormat("en-US")));
const format=f.format;console.log(format(0),format===f.format,format.name==="",format.length,"prototype" in format,[0,86400e3].map(format).join(" "));
for(const n of ["formatToParts","formatRange","formatRangeToParts","resolvedOptions"]){const p=Object.getOwnPropertyDescriptor(Intl.DateTimeFormat.prototype,n);console.log(n,p.value.name,p.value.length,p.writable,p.enumerable,p.configurable);}
const g=Object.getOwnPropertyDescriptor(Intl.DateTimeFormat.prototype,"format");console.log(g.get.name,typeof g.set,g.enumerable,g.configurable,Intl.DateTimeFormat.length,Intl.DateTimeFormat.name,Object.prototype.toString.call(f),Intl.DateTimeFormat.prototype[Symbol.toStringTag]);
console.log(Intl.DateTimeFormat("en-US",{timeZone:"UTC"}).format(0),Intl.DateTimeFormat.supportedLocalesOf(["en-US","en"]).join(),Object.keys(Intl).length,Object.getOwnPropertyNames(Intl).indexOf("DateTimeFormat")<Object.getOwnPropertyNames(Intl).indexOf("NumberFormat"));
class Sub extends Intl.DateTimeFormat{}const sub=new Sub("en-US",{timeZone:"UTC"});console.log(sub instanceof Sub,sub.format(0));
let order=[];new Intl.DateTimeFormat("en-US",new Proxy({},{get(t,k){order.push(String(k));return undefined}}));console.log(order.join());`,
};
for (const [name, source] of Object.entries(dateTimePrograms))
    test(`Intl: ${name}`, () => {
        const expected = runOracle(source, { timezone: "UTC" }).stdout;
        const stress = name === "DateTimeFormat under GC stress";
        // Intl data setup under GC stress needs far more than the default
        // allowance on a loaded macOS arm64 runner (#558).
        const run = runOnHost(source, {
            gcStress: stress,
            ...(stress ? { timeoutMs: 600_000 } : {}),
        });
        assert.equal(run.error, undefined);
        assert.equal(run.status, 0, run.stderr);
        assert.equal(run.stdout, expected);
    });

// The host's local time zone and default locale are UTC and en-US in Nona;
// other IANA time zones are not available. The program builds a dozen
// formats, so it runs without GC stress like the DateTimeFormat programs.
test("Intl: DateTimeFormat defaults to UTC and en-US", () => {
    const run = runOnHost(
        `const d=new Date(Date.UTC(2026,0,5,13,4,5,9));
console.log(d.toLocaleString(),"|",d.toLocaleDateString(),"|",d.toLocaleTimeString(),"|",new Intl.DateTimeFormat().format(d));
const r=new Intl.DateTimeFormat().resolvedOptions();console.log(r.locale,r.timeZone,new Intl.DateTimeFormat("de-DE").resolvedOptions().locale,d.toLocaleString("fr-FR"));
for(const timeZone of ["Etc/UTC","GMT","Etc/GMT","UCT","Zulu","-00:00"])console.log(timeZone,new Intl.DateTimeFormat("en-US",{timeZone}).resolvedOptions().timeZone);
try{new Intl.DateTimeFormat("en-US",{timeZone:"Europe/Paris"})}catch(e){console.log(e.name,e.message)}`,
        { gcStress: false },
    );
    assert.equal(run.status, 0, run.stderr);
    assert.equal(
        run.stdout,
        "1/5/2026, 1:04:05 PM | 1/5/2026 | 1:04:05 PM | 1/5/2026\n" +
            "en-US UTC en-US 1/5/2026, 1:04:05 PM\n" +
            "Etc/UTC UTC\nGMT UTC\nEtc/GMT UTC\nUCT UTC\nZulu UTC\n-00:00 +00:00\n" +
            "RangeError Invalid time zone specified: Europe/Paris\n",
    );
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
        collectSourceUsage(() => parse(lex(source))).usage;
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

// Intl.Segmenter splits strings into grapheme clusters as Node.js (ICU) does
// (src/lib/runtime/intl.js); string-width, cliui and yargs count columns with it.
function expectOracle(source: string): void {
    const native = runOnHost(source);
    assert.equal(native.status, 0, native.stderr);
    const oracle = runOracle(source);
    assert.equal(oracle.status, 0, oracle.stderr);
    assert.equal(native.stdout, oracle.stdout);
}

test("Intl.Segmenter splits grapheme clusters as Node.js does", () =>
    expectOracle(String.raw`
const segmenter = new Intl.Segmenter();
const samples = ["abc", "a\r\nb", "e\u0301x", "\u{1F468}\u200D\u{1F469}\u200D\u{1F467}x", "\u{1F1FA}\u{1F1F8}\u{1F1EB}\u{1F1F7}\u{1F1E9}",
    "\u{1F44D}\u{1F3FD}!", "\uD55C\uAD6D\uC5B4", "\u1100\u1161\u11A8z", "\u0915\u094D\u0937\u093F", "\u0928\u092E\u0938\u094D\u0924\u0947",
    "\u0600a", "\u0E01\u0E49\u0E33", "\u200D\u200Dx", "a\u0000b", "\u{1F600}\uFE0F", "\uD800x", "", "ab\u200Dcd", "\u00A9\u200D\u00AE"];
for (const s of samples) console.log(JSON.stringify(Array.from(segmenter.segment(s), (x) => x.segment)));
const segments = segmenter.segment("a\u{1F44D}\u{1F3FD}b");
console.log(JSON.stringify(segments.containing(2)), segments.containing(9), JSON.stringify(segments.containing(-0.5)), JSON.stringify(segments.containing("1")));
const first = [...segments][1];
console.log(Object.keys(first).join(), first.input === "a\u{1F44D}\u{1F3FD}b", first.index);
`));

test("Intl.Segmenter objects, options and errors", () =>
    expectOracle(String.raw`
const segmenter = new Intl.Segmenter("en", { granularity: "grapheme", localeMatcher: "lookup" });
const segments = segmenter.segment(12);
const iterator = segments[Symbol.iterator]();
console.log(Object.prototype.toString.call(segmenter), Object.prototype.toString.call(Intl), Object.prototype.toString.call(iterator));
console.log(segmenter.resolvedOptions().granularity, Intl.Segmenter.length, Intl.Segmenter.name, Intl.Segmenter.prototype.segment.length, typeof Intl.Segmenter.supportedLocalesOf);
console.log(JSON.stringify(iterator.next()), JSON.stringify(iterator.next()), JSON.stringify(iterator.next()), iterator[Symbol.iterator]() === iterator);
console.log(Object.keys(globalThis).includes("Intl"), Object.getOwnPropertyDescriptor(Intl, "Segmenter").enumerable, Object.keys(Intl.Segmenter.prototype).length);
for (const f of [() => Intl.Segmenter(), () => new Intl.Segmenter("en", { granularity: "x" }), () => new Intl.Segmenter("en", 5),
    () => new Intl.Segmenter("en", { localeMatcher: "x" }), () => Intl.Segmenter.prototype.segment.call({}, "a"), () => segments.containing.call({}, 0)])
    try { f(); console.log("no error"); } catch (e) { console.log(e.constructor.name); }
`));

// The segmenter validates its locale without a RegExp, so a program without
// any RegExp can use it (#502).
test("Intl.Segmenter works in a program without RegExp", () => {
    const source = String.raw`const s = new Intl.Segmenter("en", { granularity: "grapheme" }); console.log([...s.segment("aé\u{1F44D}\u{1F3FD}")].length);`;
    const native = runOnHost(source);
    assert.equal(native.status, 0, native.stderr);
    assert.equal(native.stdout, "3\n");
    assert.equal(native.stdout, runOracle(source).stdout);
});

test("Intl.Segmenter validates locales without RegExp", () =>
    expectOracle(String.raw`
for (const l of ["", "a", "en-", "-en", "en--US", "en-US-", "e1", "en_US", "abcdefghi", "en-abcdefghi", "en-US", "en-u-ca-gregory"])
    try { new Intl.Segmenter(l); console.log(JSON.stringify(l), "ok"); } catch (e) { console.log(JSON.stringify(l), e.constructor.name); }
`));
