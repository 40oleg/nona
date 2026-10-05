async function main() {
  const source = {
    values: [2, 5, 8],
    [Symbol.asyncIterator]() {
      let index = 0;
      const values = this.values;
      return { async next() { await Promise.resolve(); return index < values.length ? { value: values[index++], done: false } : { done: true }; } };
    }
  };
  const output = [];
  for await (const value of source) output.push(value * 3);
  console.log(JSON.stringify(output));
}
main().catch(error => { throw error; });
