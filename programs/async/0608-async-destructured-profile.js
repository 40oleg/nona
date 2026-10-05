async function main() {
  async function label(profilePromise) {
    const { name, role = 'reader', preferences: { theme = 'light' } = {} } = await profilePromise;
    await Promise.resolve();
    return `${name}/${role}/${theme}`;
  }
  const profiles = [Promise.resolve({ name: 'Ada', preferences: { theme: 'dark' } }), Promise.resolve({ name: 'Ben', role: 'editor' })];
  const labels = await Promise.all(profiles.map(label));
  if (labels.length !== 2) throw new Error('profile missing');
  console.log(labels.join(';'));
}
main().catch(error => { throw error; });
