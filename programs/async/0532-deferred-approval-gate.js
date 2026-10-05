async function main() {
  let approve;
  const gate = new Promise(resolve => { approve = resolve; });
  const log = [];
  const publication = gate.then(async decision => {
    log.push(decision);
    return await Promise.resolve('published');
  });
  log.push('draft ready');
  approve('approved');
  log.push(await publication);
  console.log(log.join('>'));
}
main().catch(error => { throw error; });
