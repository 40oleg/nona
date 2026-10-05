function matches(node, row) {
  const [op, ...args] = node;
  if (op === 'all') return args.every(child => matches(child,row));
  if (op === 'any') return args.some(child => matches(child,row));
  if (op === 'not') return !matches(args[0],row);
  const [key,value] = args;
  return op === 'eq' ? row[key] === value : (row[key] ?? 0) >= value;
}
const query = ['all',['gte','stock',3],['not',['eq','kind','fragile']]];
const rows = [{id:'a',stock:8,kind:'solid'},{id:'b',stock:4,kind:'fragile'},{id:'c'}];
console.log(JSON.stringify(rows.filter(row => matches(query,row)).map(row => row.id)));
