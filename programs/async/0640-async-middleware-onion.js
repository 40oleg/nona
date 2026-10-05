async function main() {
  const trace = [];
  const middleware = ['auth', 'audit', 'route'].map(name => async next => {
    trace.push('before:' + name);
    await next();
    trace.push('after:' + name);
  });
  async function dispatch(index) {
    if (index === middleware.length) { await Promise.resolve(); trace.push('handler'); return; }
    await middleware[index](() => dispatch(index + 1));
  }
  await dispatch(0);
  console.log(trace.join('>'));
}
main().catch(error => { throw error; });
