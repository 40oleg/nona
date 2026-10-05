const source = 'a([b]{c}) + ([x)]';
const close = { ')': '(', ']': '[', '}': '{' };
const stack = [], errors = [];
for (let i = 0; i < source.length; i++) {
  const c = source[i];
  if ('([{'.includes(c)) stack.push([c, i]);
  else if (c in close) {
    const opener = stack.pop();
    if (!opener || opener[0] !== close[c]) errors.push({ at: i, found: c, opener: opener || null });
  }
}
for (const [character, at] of stack) errors.push({ at, unclosed: character });
console.log(JSON.stringify(errors));
