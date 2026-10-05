async function main() {
  const completed = [];
  async function task(label, steps) {
    for (let step = 0; step < steps; step++) await Promise.resolve();
    completed.push(label);
    return label.toUpperCase();
  }
  const results = await Promise.all([task('deep', 3), task('quick', 1), task('middle', 2)]);
  const orderDiffers = completed[0] !== 'deep';
  console.log(JSON.stringify([results, completed, orderDiffers]));
}
main().catch(error => { throw error; });
