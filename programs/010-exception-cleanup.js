// Await suspends inside try; finally runs on normal and exceptional returns.
const events = [];
async function processValue(value) {
  events.push('open:' + value);
  try {
    value = await Promise.resolve(value);
    if (value < 0) throw new Error('negative');
    return value * 2;
  } catch (error) {
    events.push('catch:' + error.message);
    return -1;
  } finally {
    events.push('close:' + value);
  }
}

async function main() {
  const first = await processValue(3);
  const second = await processValue(-2);
  console.log(first, second);
  console.log(events.join(','));
}
main();
