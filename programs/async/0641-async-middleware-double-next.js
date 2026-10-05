async function main() {
  let furthest = -1;
  const trace = [];
  async function dispatch(index) {
    if (index <= furthest) throw new Error('next twice');
    furthest = index;
    if (index === 1) { trace.push('handler'); return; }
    await dispatch(1);
    await dispatch(1);
  }
  try { await dispatch(0); }
  catch (error) { trace.push(error.message); }
  console.log(trace.join('|'));
}
main().catch(error => { throw error; });
