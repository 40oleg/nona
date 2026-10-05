const source = 'x{a,b{1,2}}y';
let at = 0;
function expression() {
  let all = [], product = [''];
  while (at < source.length && source[at] !== '}') {
    if (source[at] === ',') { all.push(...product); product = ['']; at++; continue; }
    let values;
    if (source[at] === '{') { at++; values = expression(); at++; }
    else values = [source[at++]];
    product = product.flatMap(prefix => values.map(value => prefix + value));
  }
  return all.concat(product);
}
console.log(JSON.stringify(expression()));
