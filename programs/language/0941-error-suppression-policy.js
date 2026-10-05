class Recoverable extends Error {}
function tolerant(fn) {
  try { return fn(); }
  catch(error) { if (error instanceof Recoverable) return 'fallback'; throw error; }
}
const results = [];
results.push(tolerant(() => 3));
results.push(tolerant(() => {throw new Recoverable('temporary');}));
try { tolerant(() => {throw new Error('fatal');}); }
catch(error) { results.push(error.message); }
console.log(JSON.stringify(results));
