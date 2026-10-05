function environment(values, parent) {
  return { get(key) { return values[key] ?? parent?.get(key) ?? '?'; } };
}
const base = environment({city:'Oslo',name:'guest'});
const local = environment({name:'Ada'},base);
function render(parts, env) {
  return parts.map(part => typeof part === 'string' ? part : env.get(part.key)).join('');
}
const parts = ['Hello ',{key:'name'},' in ',{key:'city'},': ',{key:'seat'}];
console.log(render(parts,local));
console.log(render(parts,base));
