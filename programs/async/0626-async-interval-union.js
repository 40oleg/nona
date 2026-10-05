async function main() {
  const pending = [[5, 8], [1, 3], [2, 6], [10, 12]].map(range => Promise.resolve(range));
  const ranges = await Promise.all(pending);
  ranges.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const [start, end] of ranges) {
    const previous = merged.at(-1);
    if (previous && start <= previous[1]) previous[1] = Math.max(previous[1], end);
    else merged.push([start, end]);
  }
  console.log(JSON.stringify(merged));
}
main().catch(error => { throw error; });
