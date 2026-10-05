async function main() {
  let read = 0;
  async function* frames() {
    for (const frame of ['D:one', 'D:two', 'END', 'D:ignored']) { read++; yield await Promise.resolve(frame); }
  }
  const decoded = [];
  for await (const frame of frames()) {
    if (frame === 'END') break;
    if (!frame.startsWith('D:')) throw new Error('bad frame');
    decoded.push(frame.slice(2));
  }
  console.log(JSON.stringify([decoded, read]));
}
main().catch(error => { throw error; });
