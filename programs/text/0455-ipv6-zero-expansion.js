function expand(address) {
  const halves = address.split('::');
  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves.length > 1 && halves[1] ? halves[1].split(':') : [];
  const zeros = halves.length > 1 ? Array(8 - left.length - right.length).fill('0') : [];
  const groups = left.concat(zeros, right);
  if (groups.length !== 8) return 'invalid';
  return groups.map(group => group.padStart(4, '0')).join(':');
}
console.log(JSON.stringify(['2001:db8::1', '::', 'fe80::abcd:12'].map(expand)));
