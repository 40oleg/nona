const migrations = {
  1:({fullName,...rest}) => ({...rest,name:fullName,version:2}),
  2:({name,...rest}) => ({...rest,profile:{name},version:3})
};
function migrate(record) {
  let current = {...record};
  while (migrations[current.version]) current = migrations[current.version](current);
  return current;
}
const old = {id:7,fullName:'Ada',version:1};
console.log(JSON.stringify({old,new:migrate(old)}));
