const frequencies = Object.create(null);
for (const word of ["constructor", "pear", "__proto__", "pear"]) {
  frequencies[word] = (frequencies[word] ?? 0) + 1;
}
const ordered = Object.keys(frequencies).sort();
const entries = ordered.map(key => [key, frequencies[key]]);
console.log(JSON.stringify({
  prototype: Object.getPrototypeOf(frequencies),
  entries,
  own: Object.hasOwn(frequencies, "constructor")
}));
