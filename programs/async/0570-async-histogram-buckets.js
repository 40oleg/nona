async function main() {
  async function* latencies() {
    for (const latency of [2, 7, 11, 14, 23, 5]) yield await Promise.resolve(latency);
  }
  const histogram = new Map();
  for await (const latency of latencies()) {
    const bucket = Math.floor(latency / 10) * 10;
    histogram.set(bucket, (histogram.get(bucket) || 0) + 1);
  }
  const ordered = Array.from(histogram).sort((a, b) => a[0] - b[0]);
  console.log(JSON.stringify(ordered));
}
main().catch(error => { throw error; });
