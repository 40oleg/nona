var parent = {inherited: 1, hidden: 2};
var child = Object.create(parent);
Object.defineProperty(child, 'hidden', {value: 3});
child.first = 4;
child.second = 5;

var result = '';
for (var key in child) result += key + ',';
console.log(result);

for (var key in child) {
  if (key === 'first') delete child.second;
}
console.log(key);
