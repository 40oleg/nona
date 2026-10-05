async function main() {
  const scope = { cancelled: false };
  async function child(name) {
    await Promise.resolve();
    if (scope.cancelled) return name + ':cancelled';
    return name + ':finished';
  }
  const pending = ['scan', 'index', 'export'].map(child);
  scope.cancelled = true;
  const statuses = await Promise.all(pending);
  const count = statuses.filter(status => status.endsWith('cancelled')).length;
  console.log(JSON.stringify([statuses, count]));
}
main().catch(error => { throw error; });
