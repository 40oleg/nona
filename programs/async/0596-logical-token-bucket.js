async function main() {
  let tokens = 3;
  const capacity = 3;
  const admitted = [];
  const requests = [{ tick: 0, cost: 2 }, { tick: 0, cost: 2 }, { tick: 2, cost: 2 }, { tick: 3, cost: 3 }];
  let previous = 0;
  for (const request of requests) {
    tokens = Math.min(capacity, tokens + request.tick - previous); previous = request.tick;
    const accepted = await Promise.resolve(tokens >= request.cost);
    if (accepted) tokens -= request.cost;
    admitted.push(accepted);
  }
  console.log(JSON.stringify([admitted, tokens]));
}
main().catch(error => { throw error; });
