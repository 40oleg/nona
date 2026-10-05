function money(cents) {
  const absolute = Math.abs(cents);
  const whole = String(Math.floor(absolute / 100));
  let grouped = '';
  for (let i = 0; i < whole.length; i++) {
    if (i && (whole.length - i) % 3 === 0) grouped += ',';
    grouped += whole[i];
  }
  const value = grouped + '.' + String(absolute % 100).padStart(2, '0');
  return cents < 0 ? '(' + value + ')' : value;
}
console.log(JSON.stringify([0, 123456, -507, 9000001].map(money)));
