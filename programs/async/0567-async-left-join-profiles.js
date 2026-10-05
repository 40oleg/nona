async function main() {
  const users = [{ id: 1, name: 'Ada' }, { id: 2, name: 'Ben' }];
  const profileRows = await Promise.resolve([[1, 'admin']]);
  const profiles = new Map(profileRows);
  const joined = await Promise.all(users.map(async user => {
    const role = await Promise.resolve(profiles.get(user.id));
    return { ...user, role: role ?? 'guest' };
  }));
  const missing = joined.filter(user => user.role === 'guest').length;
  console.log(JSON.stringify([joined, missing]));
}
main().catch(error => { throw error; });
