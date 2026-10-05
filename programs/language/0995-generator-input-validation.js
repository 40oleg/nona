function* survey() {
  const name = yield 'name';
  if (!name) throw new Error('name required');
  const age = yield 'age';
  if (age < 0) throw new Error('age invalid');
  return {name,age};
}
const valid = survey(); valid.next(); valid.next('Ada');
const {value} = valid.next(5);
console.log(JSON.stringify(value));
const invalid = survey(); invalid.next();
try { invalid.next(''); } catch(error) { console.log(error.message); }
