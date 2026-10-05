const trace = [];
const plugins = [
  {before:value => {trace.push('before'); return value+1;},after:value => value*2},
  {after:value => 0},
  {}
];
let value = 3;
for (const plugin of plugins) {
  value = plugin.before?.(value) ?? value;
  value = plugin.after?.(value) ?? value;
}
console.log(JSON.stringify({value,trace}));
