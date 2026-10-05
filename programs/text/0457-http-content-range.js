const size = 100;
function range(spec) {
  const [a, b] = spec.split('-');
  let start, end;
  if (a === '') { start = Math.max(0, size - Number(b)); end = size - 1; }
  else { start = Number(a); end = b === '' ? size - 1 : Math.min(size - 1, Number(b)); }
  if (start >= size || start > end) return null;
  return [start, end, end - start + 1];
}
const request = 'bytes=0-9,90-,-5,120-130';
console.log(JSON.stringify(request.slice(6).split(',').map(range)));
