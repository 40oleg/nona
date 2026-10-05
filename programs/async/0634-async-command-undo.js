async function main() {
  let text = '';
  const history = [];
  async function append(fragment) {
    const previous = text;
    text += await Promise.resolve(fragment);
    history.push(async () => { text = await Promise.resolve(previous); });
  }
  await append('hello');
  await append(' world');
  await append('!');
  await history.pop()();
  await history.pop()();
  console.log(text + ':' + history.length);
}
main().catch(error => { throw error; });
