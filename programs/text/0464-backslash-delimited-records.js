const source = 'alpha|a\\|b|slash\\\\end|';
const fields = [];
let field = '', escaping = false;
for (const c of source) {
  if (escaping) { field += c; escaping = false; }
  else if (c === '\\') escaping = true;
  else if (c === '|') { fields.push(field); field = ''; }
  else field += c;
}
fields.push(field);
console.log(JSON.stringify(fields));
