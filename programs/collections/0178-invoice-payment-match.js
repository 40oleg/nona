const invoices = [{id:11,total:90},{id:12,total:60},{id:13,total:25}];
const payments = [[11,30],[12,60],[11,20]];
const paid = payments.reduce((index, pair) => {
  index.set(pair[0], (index.get(pair[0]) || 0) + pair[1]);
  return index;
}, new Map());
const open = invoices.map(row => ({id:row.id,left:row.total-(paid.get(row.id)||0)}));
const owing = open.filter(row => row.left > 0);
const total = owing.reduce((sum,row) => sum + row.left, 0);
console.log(JSON.stringify({owing,total}));
