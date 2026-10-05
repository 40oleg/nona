async function main() {
  const audit = ['start'];
  const first = Promise.resolve().then(() => {
    audit.push('first');
    return Promise.resolve().then(() => audit.push('nested'));
  });
  const second = Promise.resolve().then(() => audit.push('second'));
  audit.push('scheduled');
  await Promise.all([first, second]);
  audit.push('complete');
  console.log(audit.join('>'));
}
main().catch(error => { throw error; });
