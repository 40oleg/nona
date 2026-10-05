async function main() {
  class Formatter {
    async format(value) { return await Promise.resolve(value.trim()); }
  }
  class BracketFormatter extends Formatter {
    async format(value) {
      const plain = await super.format(value);
      return '[' + plain.toUpperCase() + ']';
    }
  }
  const formatter = new BracketFormatter();
  console.log(await formatter.format(' hello '));
}
main().catch(error => { throw error; });
