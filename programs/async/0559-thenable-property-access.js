async function main() {
  const trace = [];
  const value = {
    get then() {
      trace.push('get then');
      return resolve => { trace.push('call then'); resolve(12); };
    }
  };
  const promise = Promise.resolve(value);
  trace.push('after resolve');
  const result = await promise.then(number => number / 3);
  console.log(JSON.stringify([result, trace]));
}
main().catch(error => { throw error; });
