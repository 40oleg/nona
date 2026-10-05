async function main() {
  const circuit = { state: 'closed', failures: 0 };
  const states = [];
  for (const outcome of [false, false, true]) {
    if (circuit.state === 'open') circuit.state = 'probe';
    try {
      if (!await Promise.resolve(outcome)) throw new Error('down');
      circuit.failures = 0; circuit.state = 'closed';
    } catch (error) { if (++circuit.failures >= 2) circuit.state = 'open'; }
    states.push(circuit.state);
  }
  console.log(JSON.stringify(states));
}
main().catch(error => { throw error; });
