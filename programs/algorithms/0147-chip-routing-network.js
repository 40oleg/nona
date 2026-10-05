const nodes = [{left: 1, right: 2, rotor: 0}, {left: 3, right: 4, rotor: 0}, {left: 3, right: 4, rotor: 0}];
const sinks = [0, 0];
for (let chip = 0; chip < 10; chip++) {
  let node = 0;
  while (node < 3) {
    const state = nodes[node], next = state.rotor ? state.right : state.left;
    state.rotor = 1 - state.rotor; node = next;
  }
  sinks[node - 3]++;
}
console.log(sinks.join(',') + ':' + nodes.map(n => n.rotor).join(''));
