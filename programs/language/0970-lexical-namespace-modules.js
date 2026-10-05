function namespace(prefix) {
  const values = {};
  return {
    define(name,value) { values[name] = value; },
    export() { return Object.entries(values).map(([name,value]) => [prefix+'.'+name,value]); }
  };
}
const a = namespace('alpha'), b = namespace('beta');
a.define('rate',2); b.define('rate',5);
const entries = [...a.export(),...b.export()];
console.log(JSON.stringify(Object.fromEntries(entries)));
