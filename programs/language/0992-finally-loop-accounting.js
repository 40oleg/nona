const audit = [], accepted = [];
for (const [index,value] of [2,-1,4,9,6].entries()) {
  try {
    if (value < 0) continue;
    if (value > 5) break;
    accepted.push(value);
  } finally { audit.push(index); }
}
console.log(JSON.stringify({accepted,audit}));
console.log(accepted.reduce((sum,value) => sum+value,0));
