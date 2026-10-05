const trace = [];
function* source() {
  try {
    for (let value = 1; value <= 6; value++) { trace.push('yield:'+value); yield value; }
  } finally { trace.push('closed'); }
}
let sum = 0;
for (const value of source()) {
  sum += value;
  if (sum >= 6) break;
}
console.log(JSON.stringify({sum,trace}));
