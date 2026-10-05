async function main() {
  async function* review() {
    const approved = yield { stage: 'review', document: 'policy' };
    if (!approved) return 'rejected';
    const signature = await Promise.resolve('signed');
    yield { stage: signature };
    return 'published';
  }
  const flow = review();
  const pending = await flow.next();
  const signed = await flow.next(true);
  const complete = await flow.next();
  console.log(JSON.stringify([pending.value, signed.value, complete.value]));
}
main().catch(error => { throw error; });
