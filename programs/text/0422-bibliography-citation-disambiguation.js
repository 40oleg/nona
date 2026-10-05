const records = [
  { id: 'z', author: 'Smith', year: 2020, title: 'Zebra study' },
  { id: 'a', author: 'Smith', year: 2020, title: 'Apple study' },
  { id: 'b', author: 'Jones', year: 2021, title: 'Birds' },
  { id: 'c', author: 'Smith', year: 2020, title: 'Cloud study' }
];
const groups = new Map();
for (const record of records) {
  const key = record.author + ':' + record.year;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(record);
}
const labels = {};
for (const group of groups.values()) {
  group.sort((a, b) => a.title < b.title ? -1 : a.title > b.title ? 1 : 0);
  for (let index = 0; index < group.length; index++) {
    const record = group[index];
    const suffix = group.length > 1 ? String.fromCharCode(97 + index) : '';
    labels[record.id] = record.author + ' ' + record.year + suffix;
  }
}
const citedOrder = ['z', 'b', 'a', 'c'];
console.log(JSON.stringify({ labels, citations: citedOrder.map(id => '[' + labels[id] + ']') }));
