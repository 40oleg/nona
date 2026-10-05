let population = {prey: 20, predators: 5}; const trace = [];
for (let tick = 0; tick < 8; tick++) {
  const {prey, predators} = population;
  const encounters = 0.02 * prey * predators;
  population = {prey: prey + 0.2 * prey - encounters, predators: predators + 0.1 * encounters - 0.1 * predators};
  if (population.prey < 0 || population.predators < 0) throw new Error('negative population');
  trace.push([Math.round(population.prey), Math.round(population.predators)]);
}
console.log(JSON.stringify(trace));
