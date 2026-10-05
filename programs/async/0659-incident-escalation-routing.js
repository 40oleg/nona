async function main() {
  const responders = new Map([
    ['primary', { available: false, level: 1, next: 'secondary' }],
    ['secondary', { available: true, level: 2, next: 'lead' }],
    ['lead', { available: true, level: 3, next: null }]
  ]);
  const incidents = [{ id: 'disk', severity: 1 }, { id: 'outage', severity: 3 }];
  const assigned = [];
  for (const incident of incidents) {
    let name = 'primary';
    const visited = new Set();
    while (name !== null) {
      if (visited.has(name)) throw new Error('escalation cycle');
      visited.add(name);
      const responder = await Promise.resolve(responders.get(name));
      if (responder.available && responder.level >= incident.severity) { assigned.push([incident.id, name, Array.from(visited)]); break; }
      name = responder.next;
    }
    if (name === null) throw new Error('no qualified responder');
  }
  console.log(JSON.stringify(assigned));
}
main().catch(error => { throw error; });
