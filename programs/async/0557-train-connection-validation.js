async function main() {
  const itineraries = [
    [{ from: 'A', to: 'B', depart: 0, arrive: 4 }, { from: 'B', to: 'C', depart: 6, arrive: 9 }],
    [{ from: 'A', to: 'B', depart: 1, arrive: 5 }, { from: 'B', to: 'C', depart: 6, arrive: 8 }],
    [{ from: 'A', to: 'D', depart: 0, arrive: 3 }, { from: 'B', to: 'C', depart: 8, arrive: 10 }]
  ];
  const verdicts = await Promise.all(itineraries.map(async legs => {
    const route = await Promise.resolve(legs);
    for (let i = 1; i < route.length; i++) {
      if (route[i - 1].to !== route[i].from) return 'wrong station';
      if (route[i].depart - route[i - 1].arrive < 2) return 'short transfer';
    }
    return 'valid:' + (route.at(-1).arrive - route[0].depart);
  }));
  console.log(JSON.stringify(verdicts));
}
main().catch(error => { throw error; });
