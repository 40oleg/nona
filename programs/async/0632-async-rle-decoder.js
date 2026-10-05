async function main() {
  async function* runs() {
    yield await Promise.resolve({ symbol: 'x', count: 2 });
    yield await Promise.resolve({ symbol: 'y', count: 3 });
    yield { symbol: 'z', count: 1 };
  }
  let decoded = '';
  for await (const { symbol, count } of runs()) {
    if (count < 0) throw new Error('invalid run');
    decoded += symbol.repeat(count);
  }
  console.log(decoded + ':' + decoded.length);
}
main().catch(error => { throw error; });
