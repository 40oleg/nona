function format(items) {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  if (items.length === 2) return items.join(' and ');
  const initial = items.slice(0, -1).join(', ');
  return initial + ', and ' + items[items.length - 1];
}
const names = ['Ada', 'Lin', 'Sam', 'Jo'];
const examples = [];
for (let count = 0; count <= names.length; count++) examples.push(format(names.slice(0, count)));
console.log(JSON.stringify(examples));
