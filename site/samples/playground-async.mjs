// An ES module with async functions, promises and timers.
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function worker(name, delay) {
  await sleep(delay);
  return `${name} finished after ${delay} ms`;
}

async function main() {
  const started = Date.now();
  const results = await Promise.all([worker('first', 30), worker('second', 10), worker('third', 20)]);
  for (const line of results) console.log(line);
  console.log(`Promise.all ran them concurrently: ${Date.now() - started < 60}`);

  const fastest = await Promise.race([worker('tortoise', 40), worker('hare', 5)]);
  console.log('race:', fastest);

  try {
    await Promise.reject(new Error('handled'));
  } catch (error) {
    console.log('caught:', error.message);
  }
}

main();
