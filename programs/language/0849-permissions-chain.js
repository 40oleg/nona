const roles = {guest:{allow:['read']},writer:{parent:'guest',allow:['write']},admin:{parent:'writer',allow:['delete']}};
function permissions(name, seen = []) {
  if (seen.includes(name)) throw new Error('cycle');
  const role = roles[name];
  if (!role) return [];
  const inherited = role.parent ? permissions(role.parent,[...seen,name]) : [];
  return [...inherited,...role.allow];
}
const requests = [{role:'writer',action:'delete'},{role:'admin',action:'write'},{role:'guest',action:'read'}];
console.log(JSON.stringify(requests.map(({role,action}) => permissions(role).includes(action))));
console.log(roles.missing?.parent ?? 'none');
