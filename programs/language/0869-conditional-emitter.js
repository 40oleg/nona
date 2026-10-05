function compile(block) {
  if (typeof block === 'string') return () => block;
  if (block.field) return model => String(model[block.field] ?? '');
  const children = block.children.map(compile);
  return model => block.when && !model[block.when] ? '' : children.map(fn => fn(model)).join('');
}
const render = compile({children:['User ',{field:'name'},{when:'vip',children:[' (VIP)']}]});
const users = [{name:'Ada',vip:true},{name:'Bea'}];
for (const user of users) console.log(render(user));
console.log(users[1]?.vip ?? false);
