async function main() {
  const input = { name: 'Ada', age: 12 };
  const stages = [async value => value.name.length > 0, async value => value.age >= 18, async () => true];
  let executed = 0;
  let result = 'accepted';
  try {
    for (const stage of stages) {
      executed++;
      if (!await stage(input)) throw new Error('stage-' + executed);
    }
  } catch (error) { result = error.message; }
  console.log(result + ':' + executed);
}
main().catch(error => { throw error; });
