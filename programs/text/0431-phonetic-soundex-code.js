const groups = { b: '1', f: '1', p: '1', v: '1', c: '2', g: '2', j: '2', k: '2', q: '2', s: '2', x: '2', z: '2', d: '3', t: '3', l: '4', m: '5', n: '5', r: '6' };
function soundex(name) {
  const letters = name.toLowerCase();
  let result = letters[0].toUpperCase(), previous = groups[letters[0]] || '';
  for (let i = 1; i < letters.length && result.length < 4; i++) {
    const code = groups[letters[i]] || '';
    if (code && code !== previous) result += code;
    if (letters[i] !== 'h' && letters[i] !== 'w') previous = code;
  }
  return result.padEnd(4, '0');
}
console.log(JSON.stringify(['Robert', 'Rupert', 'Ashcraft'].map(soundex)));
