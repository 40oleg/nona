const template = '{{{0}}} has {1} items';
const args = ['box', 3];
let result = '';
for (let i = 0; i < template.length; i++) {
  if (template.slice(i, i + 2) === '{{') { result += '{'; i++; }
  else if (template.slice(i, i + 2) === '}}') { result += '}'; i++; }
  else if (template[i] === '{') {
    const end = template.indexOf('}', i); result += String(args[Number(template.slice(i + 1, end))]); i = end;
  } else result += template[i];
}
console.log(result);
