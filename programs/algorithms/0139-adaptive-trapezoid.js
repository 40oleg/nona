const f = x => 1 / (1 + x * x); let panels = 1, estimate = (f(0) + f(1)) / 2;
const trace = [];
for (let refinement = 0; refinement < 6; refinement++) {
  let added = 0;
  for (let i = 0; i < panels; i++) added += f((i + 0.5) / panels);
  estimate = estimate / 2 + added / (panels * 2); panels *= 2;
  trace.push(Math.round(estimate * 1000000));
}
console.log(panels + ':' + trace.join(','));
