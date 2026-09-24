missing = 3;
console.log(missing, globalThis.missing);
delete globalThis.missing;
try { console.log(missing); } catch (error) { console.log(error.name); }

function outer(console, undefined) {
  "use strict";
  console.log(undefined);
  { console.log(block()); function block() { return 7; } }
  console.log(typeof block);
}
outer({log: globalThis.console.log}, 5);

try { throw 1; } catch (value) { var value; console.log(value); }
