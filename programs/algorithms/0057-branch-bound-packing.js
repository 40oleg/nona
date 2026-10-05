const goods = [[3, 8], [2, 5], [4, 9], [1, 2]], suffix = [0, 0, 0, 0, 0];
for (let i = goods.length - 1; i >= 0; i--) suffix[i] = suffix[i + 1] + goods[i][1];
let best = 0, pruned = 0;
function search(i, room, score) {
  if (score + suffix[i] <= best) { pruned++; return; }
  if (i === goods.length) { best = score; return; }
  if (goods[i][0] <= room) search(i + 1, room - goods[i][0], score + goods[i][1]);
  search(i + 1, room, score);
}
search(0, 6, 0);
console.log(best + ':' + pruned);
