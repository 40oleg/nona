async function main() {
  const key = await Promise.resolve('score');
  const value = await Promise.resolve(8);
  const first = { [key]: value };
  const nextKey = await Promise.resolve('rank');
  const combined = { ...first, [nextKey]: value > 5 ? 'high' : 'low' };
  const keys = Object.keys(combined);
  if (keys.length !== 2) throw new Error('property lost');
  console.log(JSON.stringify([combined, keys]));
}
main().catch(error => { throw error; });
