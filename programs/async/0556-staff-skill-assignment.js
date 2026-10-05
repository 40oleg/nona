async function main() {
  const staff = [{ name: 'Ada', skills: ['repair', 'install'], load: 0 }, { name: 'Ben', skills: ['repair'], load: 0 }];
  async function* requests() {
    for (const skill of ['repair', 'install', 'repair', 'paint']) yield await Promise.resolve(skill);
  }
  const assignments = [];
  for await (const skill of requests()) {
    const qualified = staff.filter(person => person.skills.includes(skill));
    qualified.sort((a, b) => a.load - b.load || a.name.localeCompare(b.name));
    if (!qualified.length) { assignments.push(skill + ':unassigned'); continue; }
    const selected = qualified[0];
    selected.load++;
    assignments.push(skill + ':' + selected.name);
  }
  console.log(JSON.stringify([assignments, staff.map(person => [person.name, person.load])]));
}
main().catch(error => { throw error; });
