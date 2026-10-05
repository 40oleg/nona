const lines = ['First[^beta], second[^alpha], again[^beta].', '[^alpha]: Alpha note', '[^beta]: Beta note'];
const definitions = new Map(), body = [];
for (const line of lines) {
  const match = /^\[\^([^\]]+)\]:\s*(.*)$/.exec(line);
  if (match) definitions.set(match[1], match[2]);
  else body.push(line);
}
const notes = [], numbered = new Map();
let references = 0;
const text = body.join('\n').replace(/\[\^([^\]]+)\]/g, (whole, name) => {
  if (!definitions.has(name)) return whole;
  if (!numbered.has(name)) {
    numbered.set(name, notes.length + 1);
    notes.push({ name, number: notes.length + 1, text: definitions.get(name), backlinks: [] });
  }
  const number = numbered.get(name);
  const reference = 'ref-' + ++references;
  notes[number - 1].backlinks.push(reference);
  return '<sup id="' + reference + '">' + number + '</sup>';
});
console.log(JSON.stringify({ text, notes }));
