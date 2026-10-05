const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const source = 'A&amp;B &#65; &#x3a9; &unknown;';
const result = source.replace(/&([^;]+);/g, (whole, name) => {
  if (name[0] !== '#') return entities[name] || whole;
  const hexadecimal = name[1] === 'x';
  const number = parseInt(name.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10);
  if (!Number.isFinite(number) || number < 0 || number > 1114111) return whole;
  return String.fromCodePoint(number);
});
console.log(result);
