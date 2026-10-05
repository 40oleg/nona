function* merge(a,b) {
  const left = a[Symbol.iterator](), right = b[Symbol.iterator]();
  let x = left.next(), y = right.next();
  while (!x.done || !y.done) {
    if (y.done || (!x.done && x.value <= y.value)) { yield x.value; x = left.next(); }
    else { yield y.value; y = right.next(); }
  }
}
const [first,...rest] = [...merge([1,4,7],[2,3,8])];
console.log(JSON.stringify({first,rest}));
console.log(rest[9] ?? 'end');
