async function main() {
  async function* chunks() {
    yield await Promise.resolve([3, 5, 9]);
    yield await Promise.resolve([2, 8]);
    yield await Promise.resolve([7]);
  }
  let checksum = 0;
  let bytes = 0;
  for await (const chunk of chunks()) {
    for (const byte of chunk) { checksum = (checksum * 31 ^ byte) & 255; bytes++; }
  }
  console.log(bytes + ':' + checksum);
}
main().catch(error => { throw error; });
