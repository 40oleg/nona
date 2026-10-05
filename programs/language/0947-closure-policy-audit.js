function gate(limit) {
  let rejected = 0; const history = [];
  return {
    allow({id,weight}) {
      const allowed = weight <= limit;
      if (!allowed) rejected++;
      history.push({id,allowed}); return allowed;
    }, report() { return {rejected,history:[...history]}; }
  };
}
const check = gate(5);
for (const row of [{id:'a',weight:3},{id:'b',weight:8},{id:'c',weight:5}]) check.allow(row);
console.log(JSON.stringify(check.report()));
