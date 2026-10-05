const cohorts = [["a","b","c"],["d","e"]];
const activeMonths = [new Set(["a","b","c","d","e"]),new Set(["a","c","d"]),new Set(["c","e"])];
const retention = cohorts.map(cohort=>{
  return activeMonths.map(active=>{
    const retained = cohort.filter(customer=>active.has(customer));
    return {count:retained.length,rate:retained.length/cohort.length};
  });
});
const everActive = new Set(activeMonths.flatMap(active=>Array.from(active)));
console.log(JSON.stringify({retention,everActive:everActive.size}));
