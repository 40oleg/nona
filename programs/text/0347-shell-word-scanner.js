const input = 'copy "two words" bare\\ space \'last\'';
const words = [];
let word = '', quote = '', active = false;
for (let i = 0; i < input.length; i++) {
  const c = input[i];
  if (c === '\\' && quote !== "'") { word += input[++i]; active = true; }
  else if (quote) { if (c === quote) quote = ''; else word += c; }
  else if (c === '"' || c === "'") { quote = c; active = true; }
  else if (c === ' ') { if (active) words.push(word); word = ''; active = false; }
  else { word += c; active = true; }
}
if (active) words.push(word);
console.log(JSON.stringify(words));
