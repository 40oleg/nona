async function main() {
  const notifications = [];
  async function run(name, succeeds) {
    let state = 'success';
    try { if (!succeeds) await Promise.reject(new Error('failed')); else await Promise.resolve(); }
    catch (error) { state = error.message; }
    finally { notifications.push(name + ':' + state); }
    return state;
  }
  const results = await Promise.all([run('a', true), run('b', false)]);
  console.log(JSON.stringify([results, notifications]));
}
main().catch(error => { throw error; });
