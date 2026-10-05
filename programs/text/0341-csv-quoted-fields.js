const input = 'name,"red, blue","say ""hi""",7';
const fields = [];
let field = '', quoted = false;
for (let i = 0; i < input.length; i++) {
  const c = input[i];
  if (c === '"' && quoted && input[i + 1] === '"') { field += '"'; i++; }
  else if (c === '"') quoted = !quoted;
  else if (c === ',' && !quoted) { fields.push(field); field = ''; }
  else field += c;
}
fields.push(field);
console.log(JSON.stringify(fields));
