const text = 'abcΩΨ12deΖ';
const runs = [];
for (const symbol of text) {
  const script = /\p{Script=Greek}/u.test(symbol) ? 'Greek' : /\p{Number}/u.test(symbol) ? 'Number' : 'Latin';
  const last = runs[runs.length - 1];
  if (last && last.script === script) last.text += symbol;
  else {
    runs.push({ script, text: symbol });
  }
}
console.log(JSON.stringify(runs));
