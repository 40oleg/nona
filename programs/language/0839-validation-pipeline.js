const pipe = (...steps) => value => steps.reduce((v, step) => step(v), value);
const trim = value => value.trim();
const required = value => { if (!value) throw new Error('required'); return value; };
const name = pipe(trim, required, value => value.toUpperCase());
const outcomes = [];
for (const input of ['  alice  ', '   ', 'bob']) {
  try { outcomes.push({ok:true,value:name(input)}); }
  catch (error) { outcomes.push({ok:false,reason:error.message}); }
}
console.log(JSON.stringify(outcomes));
