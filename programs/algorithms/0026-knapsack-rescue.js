const supplies = [[2, 6], [3, 10], [4, 12]], limit = 6;
const value = new Int32Array(limit + 1);
for (const [mass, benefit] of supplies) {
  for (let room = limit; room >= mass; room--) value[room] = Math.max(value[room], value[room - mass] + benefit);
}
if (value[6] !== 18) throw new Error('indivisible supplies');
const useful = Array.from(value).map((v, capacity) => capacity + '=' + v);
console.log(useful.join(','));
