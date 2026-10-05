async function main() {
  async function* stream(values) { for (const value of values) yield await Promise.resolve(value); }
  const left = stream([1, 4, 7]);
  const right = stream([2, 3, 8]);
  let a = await left.next();
  let b = await right.next();
  const merged = [];
  while (!a.done || !b.done) {
    if (b.done || !a.done && a.value <= b.value) { merged.push(a.value); a = await left.next(); }
    else { merged.push(b.value); b = await right.next(); }
  }
  console.log(JSON.stringify(merged));
}
main().catch(error => { throw error; });
