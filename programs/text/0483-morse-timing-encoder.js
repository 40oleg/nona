const codes = { S: '...', O: '---' };
const message = 'SOS';
const pulses = [];
for (let letter = 0; letter < message.length; letter++) {
  const code = codes[message[letter]];
  for (let i = 0; i < code.length; i++) { pulses.push(['on', code[i] === '.' ? 1 : 3]); if (i + 1 < code.length) pulses.push(['off', 1]); }
  if (letter + 1 < message.length) pulses.push(['off', 3]);
}
const duration = pulses.reduce((sum, pulse) => sum + pulse[1], 0);
console.log(JSON.stringify({ pulses, duration }));
