class Missing extends Error {}
class Invalid extends Error {}
function parse({name,age}) {
  if (!name) throw new Missing('name');
  if (age < 0) throw new Invalid('age');
  return name+':'+age;
}
const results = [];
for (const row of [{age:2},{name:'Bo',age:-1},{name:'Ada',age:8}]) {
  try { results.push(parse(row)); }
  catch(e) { results.push((e instanceof Missing ? 'missing:' : 'invalid:')+e.message); }
}
console.log(JSON.stringify(results));
