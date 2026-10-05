const source = 'WEAREDISCOVEREDFLEEATONCE';
const rails = [[], [], []];
let rail = 0, direction = 1;
for (const c of source) {
  rails[rail].push(c);
  if (rail === 0) direction = 1;
  if (rail === rails.length - 1) direction = -1;
  rail += direction;
}
const encoded = rails.map(row => row.join('')).join('');
console.log(JSON.stringify({ encoded, rails: rails.map(row => row.join('')) }));
