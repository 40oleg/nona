const lines = ['; settings', '[ui]', 'theme = dark', 'size=12', '[net]', 'port=8080', 'port=9000'];
const sections = {};
let section = '';
for (const raw of lines) {
  const line = raw.trim();
  if (!line || line[0] === ';') continue;
  if (line[0] === '[') { section = line.slice(1, -1); sections[section] = {}; continue; }
  const split = line.indexOf('=');
  if (split >= 0) sections[section][line.slice(0, split).trim()] = line.slice(split + 1).trim();
}
console.log(JSON.stringify(sections));
