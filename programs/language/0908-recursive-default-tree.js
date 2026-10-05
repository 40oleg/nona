function fill(schema, value) {
  if (typeof schema !== 'object') return value ?? schema;
  const result = {};
  for (const [key,child] of Object.entries(schema)) result[key] = fill(child,value?.[key]);
  return result;
}
const schema = {layout:{width:80,compact:false},title:'Untitled'};
const result = fill(schema,{layout:{width:0},title:''});
const {layout:{width,compact},title} = result;
console.log(JSON.stringify(result));
console.log(width+':'+compact+':'+title.length);
