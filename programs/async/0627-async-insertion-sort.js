async function main() {
  async function* incoming() {
    for (const value of [7, 2, 5, 2, 9]) yield await Promise.resolve(value);
  }
  const sorted = [];
  const sizes = [];
  for await (const value of incoming()) {
    let index = 0;
    while (index < sorted.length && sorted[index] <= value) index++;
    sorted.splice(index, 0, value); sizes.push(sorted.length);
  }
  console.log(JSON.stringify([sorted, sizes]));
}
main().catch(error => { throw error; });
