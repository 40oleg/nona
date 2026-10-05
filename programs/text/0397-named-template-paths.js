const context = { user: { name: 'Ada' }, count: 4 };
const template = 'Hello ${user.name}: ${count}; ${missing.value}';
function lookup(path) {
  let value = context;
  for (const key of path.split('.')) {
    if (value === undefined || value === null) return '?';
    value = value[key];
  }
  return value === undefined ? '?' : String(value);
}
const output = template.replace(/\$\{([^}]+)\}/g, (whole, path) => lookup(path));
console.log(output);
