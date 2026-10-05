const document = { user: { name: 'Ada', roles: ['admin', 'writer'] }, active: true, empty: {} };
const events = [];
function walk(value, path) {
  if (value === null || typeof value !== 'object') { events.push([path, value]); return; }
  const keys = Object.keys(value);
  if (!keys.length) events.push([path, Array.isArray(value) ? 'empty-array' : 'empty-object']);
  for (const key of keys) {
    const segment = key.replace(/~/g, '~0').replace(/\//g, '~1');
    walk(value[key], path + '/' + segment);
  }
}
walk(document, '');
console.log(JSON.stringify(events));
