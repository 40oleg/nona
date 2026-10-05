const secret = 'APPLE', guess = 'ALLEY';
const colors = Array(5).fill('gray'), remaining = {};
for (let i = 0; i < 5; i++) {
  if (secret[i] === guess[i]) colors[i] = 'green';
  else remaining[secret[i]] = (remaining[secret[i]] || 0) + 1;
}
for (let i = 0; i < 5; i++) {
  if (colors[i] === 'green') continue;
  if (remaining[guess[i]] > 0) { colors[i] = 'yellow'; remaining[guess[i]]--; }
}
console.log(JSON.stringify({ guess, colors }));
