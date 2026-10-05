const moves = [1, 3, 4], grundy = new Uint8Array(13);
for (let pile = 1; pile < grundy.length; pile++) {
  const reachable = new Set();
  for (const move of moves) if (move <= pile) reachable.add(grundy[pile - move]);
  let mex = 0; while (reachable.has(mex)) mex++;
  grundy[pile] = mex;
}
const piles = [8, 5], options = [];
for (let index = 0; index < piles.length; index++) for (const move of moves) if (move <= piles[index] && (grundy[piles[index] - move] ^ grundy[piles[1 - index]]) === 0) options.push(index + '-' + move);
console.log((grundy[8] ^ grundy[5]) + ':' + options.join(','));
