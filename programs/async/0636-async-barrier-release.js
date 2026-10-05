async function main() {
  let arrived = 0;
  let release;
  const barrier = new Promise(resolve => { release = resolve; });
  const trace = [];
  async function participant(name) {
    trace.push('arrive:' + name);
    if (++arrived === 3) release();
    await barrier;
    trace.push('leave:' + name);
  }
  await Promise.all(['a', 'b', 'c'].map(participant));
  console.log(trace.join('|'));
}
main().catch(error => { throw error; });
