async function main() {
  const resources = [{ name: 'seat', state: 'new' }, { name: 'card', state: 'new' }];
  const preparations = await Promise.allSettled(resources.map(async resource => {
    await Promise.resolve();
    if (resource.name === 'card') throw new Error('declined');
    resource.state = 'prepared';
  }));
  if (preparations.some(result => result.status === 'rejected')) {
    for (const resource of resources) if (resource.state === 'prepared') resource.state = await Promise.resolve('aborted');
  }
  console.log(JSON.stringify(resources));
}
main().catch(error => { throw error; });
