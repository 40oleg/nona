const commands = 'R3 U2 L1 D4';
const vectors = { R: [1, 0], U: [0, 1], L: [-1, 0], D: [0, -1] };
let x = 0, y = 0;
const trail = [[x, y]];
for (const command of commands.split(' ')) {
  const [dx, dy] = vectors[command[0]];
  const count = Number(command.slice(1));
  x += dx * count;
  y += dy * count;
  trail.push([x, y]);
}
console.log(JSON.stringify(trail));
