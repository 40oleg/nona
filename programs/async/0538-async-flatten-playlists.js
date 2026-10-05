async function main() {
  async function* collections() {
    yield await Promise.resolve({ name: 'morning', tracks: ['sun', 'tea'] });
    yield await Promise.resolve({ name: 'night', tracks: ['moon'] });
  }
  async function* tracks() {
    for await (const collection of collections()) {
      for (const track of collection.tracks) yield `${collection.name}/${track}`;
    }
  }
  const output = [];
  for await (const track of tracks()) output.push(track);
  console.log(output.join('|'));
}
main().catch(error => { throw error; });
