function cell(initial) {
  let value = initial;
  const observers = [];
  return {
    get() { return value; },
    watch(fn) { observers.push(fn); fn(value); },
    set(next) { if (next === value) return; value = next; for (const fn of [...observers]) fn(value); }
  };
}
const source = cell(2), doubled = [];
source.watch(value => doubled.push(value*2));
source.set(2); source.set(5); source.set(1);
console.log(JSON.stringify({value:source.get(),doubled}));
