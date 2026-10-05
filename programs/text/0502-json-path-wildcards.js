const document = { teams: [{ members: [{ name: 'Ada' }, { name: 'Lin' }] }, { members: [{ name: 'Sam' }] }] };
const query = 'teams.*.members.*.name';
let values = [document];
for (const segment of query.split('.')) {
  const next = [];
  for (const value of values) {
    if (segment === '*') next.push(...Object.values(value));
    else if (value !== null && typeof value === 'object' && segment in value) next.push(value[segment]);
  }
  values = next;
}
console.log(JSON.stringify(values));
