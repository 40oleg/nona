async function main() {
  const visited = [];
  const result = await Promise.resolve(0)
    .then(value => { visited.push('validate'); if (!value) throw new Error('zero'); return value; })
    .then(value => { visited.push('unreachable'); return value + 1; })
    .catch(error => { visited.push(error.message); return -1; });
  const skipped = !visited.includes('unreachable');
  if (!skipped) throw new Error('handler executed');
  console.log(JSON.stringify([result, visited, skipped]));
}
main().catch(error => { throw error; });
