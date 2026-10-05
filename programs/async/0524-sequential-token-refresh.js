async function main() {
  const session = { token: 'expired', refreshes: 0 };
  async function request() {
    await Promise.resolve();
    if (session.token !== 'fresh') throw new Error('unauthorized');
    return 'profile';
  }
  let result;
  try { result = await request(); }
  catch (error) {
    if (error.message !== 'unauthorized') throw error;
    session.token = await Promise.resolve('fresh');
    session.refreshes++;
    result = await request();
  }
  console.log(result + ':' + session.refreshes);
}
main().catch(error => { throw error; });
