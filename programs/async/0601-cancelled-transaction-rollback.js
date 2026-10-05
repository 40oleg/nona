async function main() {
  const state = { source: 30, target: 10, cancelled: false };
  const before = [state.source, state.target];
  try {
    state.source -= 8;
    const cancellation = Promise.resolve().then(() => { state.cancelled = true; });
    await cancellation;
    if (state.cancelled) throw new Error('cancelled');
    state.target += 8;
  } catch (error) { [state.source, state.target] = before; }
  console.log(JSON.stringify(state));
}
main().catch(error => { throw error; });
