async function main() {
  async function* temperatures() {
    for (const value of [4, 9, 2, 7, 3]) yield await Promise.resolve(value);
  }
  const window = [];
  const maxima = [];
  for await (const temperature of temperatures()) {
    window.push(temperature);
    if (window.length > 3) window.shift();
    maxima.push(Math.max(...window));
  }
  console.log(JSON.stringify(maxima));
}
main().catch(error => { throw error; });
