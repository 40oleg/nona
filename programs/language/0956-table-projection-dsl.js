const columns = [
  {name:'name',field:'name'},
  {name:'subtotal',compute:({price,quantity}) => price*quantity},
  {name:'note',field:'note',fallback:'none'}
];
function project(row) {
  const result = {};
  for (const {name,field,compute,fallback} of columns) result[name] = compute?.(row) ?? row[field] ?? fallback;
  return result;
}
console.log(JSON.stringify([{name:'pen',price:2,quantity:3},{name:'book',price:5,quantity:1,note:''}].map(project)));
