async function main() {
  async function* arrivals() {
    for (const part of [{ index: 2, text: 'world' }, { index: 0, text: 'hello' }, { index: 1, text: ' ' }, { index: 1, text: '!' }]) yield await Promise.resolve(part);
  }
  const parts = new Map();
  const rejected = [];
  for await (const part of arrivals()) {
    try {
      if (parts.has(part.index) && parts.get(part.index) !== part.text) throw new Error('conflict:' + part.index);
      parts.set(part.index, part.text);
    } catch (error) { rejected.push(error.message); }
  }
  let payload = '';
  for (let index = 0; index < 3; index++) {
    if (!parts.has(index)) throw new Error('missing:' + index);
    payload += parts.get(index);
  }
  console.log(JSON.stringify([payload, rejected]));
}
main().catch(error => { throw error; });
