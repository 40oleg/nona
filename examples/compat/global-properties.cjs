let original = globalThis;
function readGlobal() { return globalThis; }
function shadow(globalThis) { return globalThis + 1; }
console.log(readGlobal() === original, shadow(8));

globalThis = {text: "first"};
console.log(readGlobal().text, original.globalThis === globalThis);
original.globalThis = {text: "second"};
for (let i = 0; i < 100; i++) { ({text: "" + i}); }
console.log(readGlobal().text);

console.log(delete globalThis, typeof globalThis, "globalThis" in original);
globalThis = 41;
console.log(++globalThis, original.globalThis);
original.globalThis = original;
console.log(globalThis === original);
