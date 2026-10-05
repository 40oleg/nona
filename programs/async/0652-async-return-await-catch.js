async function main() {
  async function guarded() {
    try { return await Promise.reject(new Error('inner')); }
    catch (error) { return { recovered: error.message }; }
  }
  async function passthrough() { return Promise.reject(new Error('outer')); }
  const protectedValue = await guarded();
  let outer;
  try { await passthrough(); } catch (error) { outer = error.message; }
  console.log(JSON.stringify([protectedValue, outer]));
}
main().catch(error => { throw error; });
