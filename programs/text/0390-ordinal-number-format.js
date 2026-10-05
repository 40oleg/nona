function ordinal(value) {
  const lastTwo = value % 100;
  let suffix = 'th';
  if (lastTwo < 11 || lastTwo > 13) {
    if (value % 10 === 1) suffix = 'st';
    else if (value % 10 === 2) suffix = 'nd';
    else if (value % 10 === 3) suffix = 'rd';
  }
  return String(value) + suffix;
}
console.log(JSON.stringify([1, 2, 3, 4, 11, 12, 13, 21, 112].map(ordinal)));
