async function main() {
  const tenants = [{ name: 'a', weight: 2, served: 0 }, { name: 'b', weight: 1, served: 0 }];
  const schedule = [];
  for (let slot = 0; slot < 6; slot++) {
    tenants.sort((a, b) => a.served / a.weight - b.served / b.weight || a.name.localeCompare(b.name));
    const selected = tenants[0];
    const ticket = await Promise.resolve(selected.name);
    selected.served++;
    schedule.push(ticket);
  }
  console.log(JSON.stringify([schedule, tenants]));
}
main().catch(error => { throw error; });
