let previous;
function tag(parts, ...values) {
  console.log(parts[0], parts.raw[0], Object.isFrozen(parts), Object.isFrozen(parts.raw), previous === parts, values[0]);
  previous = parts;
  return values.length;
}
function demo(value) {
  return tag`a\n${value}b`;
}
console.log(demo(1), demo(2));
