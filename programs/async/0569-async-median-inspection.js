async function main() {
  const specimens = [9, 2, 7, 4, 8];
  async function measure(raw) {
    const adjusted = await Promise.resolve(raw * 2 + 1);
    return adjusted;
  }
  const measurements = await Promise.all(specimens.map(measure));
  measurements.sort((a, b) => a - b);
  const middle = Math.floor(measurements.length / 2);
  const median = measurements[middle];
  console.log(JSON.stringify([measurements, median]));
}
main().catch(error => { throw error; });
