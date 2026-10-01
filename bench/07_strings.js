const SCALE = Number(process.env.SCALE) || 1; const S = n => Math.round(n * SCALE);
let t = performance.now();
let s = "";
for (let i = 0; i < S(200000); i++) s += "abc" + i;
const tConcat = performance.now() - t;
t = performance.now();
const parts = s.split("1");
const joined = parts.join("-");
const tSplitJoin = performance.now() - t;
t = performance.now();
let found = 0, pos = 0;
while ((pos = joined.indexOf("abc9", pos)) !== -1) { found++; pos += 4; }
const tIndexOf = performance.now() - t;
t = performance.now();
const re = /abc(\d{3})-/g;
let mcount = 0, m;
while ((m = re.exec(joined)) !== null) mcount++;
const tRegex = performance.now() - t;
console.log(JSON.stringify({ concat: tConcat, splitJoin: tSplitJoin, indexOf: tIndexOf, regex: tRegex, check: s.length + joined.length + found + mcount }));
