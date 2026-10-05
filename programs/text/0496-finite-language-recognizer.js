const transition = {
  evenA: { a: 'oddA', b: 'evenB' }, evenB: { a: 'oddA', b: 'evenB' },
  oddA: { a: 'evenA', b: 'oddB' }, oddB: { a: 'evenA', b: 'oddB' }
};
const words = ['b', 'ab', 'aab', 'abba', 'abab'];
const results = [];
for (const word of words) {
  let state = 'evenA';
  for (const c of word) state = transition[state][c];
  results.push({ word, state, accepted: state === 'evenB' });
}
console.log(JSON.stringify(results));
