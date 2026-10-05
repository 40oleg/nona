async function main() {
  const declarations = new Map([['p1', { weight: 6, hazardous: false }], ['p2', { weight: 4, hazardous: true }], ['p3', { weight: 3, hazardous: false }], ['p4', { weight: 5, hazardous: true }]]);
  const containers = [];
  for (const id of declarations.keys()) {
    const cargo = await Promise.resolve(declarations.get(id));
    let container = containers.find(bin => bin.hazardous === cargo.hazardous && bin.weight + cargo.weight <= 10);
    if (!container) {
      container = { hazardous: cargo.hazardous, weight: 0, parcels: [] };
      containers.push(container);
    }
    container.weight += cargo.weight;
    container.parcels.push(id);
  }
  const manifestWeight = containers.reduce((sum, bin) => sum + bin.weight, 0);
  if (containers.some(bin => bin.weight > 10)) throw new Error('overloaded');
  console.log(JSON.stringify([containers, manifestWeight]));
}
main().catch(error => { throw error; });
