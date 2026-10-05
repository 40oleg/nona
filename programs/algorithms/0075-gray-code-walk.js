function* gray(width) {
  for (let value = 0; value < 1 << width; value++) yield value ^ (value >> 1);
}
const sequence = [...gray(3)];
for (let i = 1; i < sequence.length; i++) {
  const difference = sequence[i] ^ sequence[i - 1];
  if (difference === 0 || (difference & (difference - 1))) throw new Error('multiple toggles');
}
console.log(sequence.join(','));
