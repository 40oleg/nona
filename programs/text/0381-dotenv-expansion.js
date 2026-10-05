const lines = ['ROOT=/srv', 'BIN=${ROOT}/bin', 'GREETING="hello world"', 'PATH=${BIN}:/usr/bin'];
const environment = {};
for (const line of lines) {
  const at = line.indexOf('=');
  const name = line.slice(0, at);
  let value = line.slice(at + 1);
  if (value[0] === '"') value = value.slice(1, -1);
  value = value.replace(/\$\{([^}]+)\}/g, (whole, key) => environment[key] || '');
  environment[name] = value;
}
console.log(JSON.stringify(environment));
