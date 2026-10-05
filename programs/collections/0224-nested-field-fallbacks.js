const users = [{id:1,profile:{nickname:"Ada"}},{id:2,profile:{nickname:""}},{id:3},{id:4,profile:null}];
const labels = users.map(user => {
  const nickname = user.profile?.nickname;
  const label = nickname ?? "user-"+user.id;
  return {id:user.id,label};
});
const empty = labels.filter(user => user.label==="").length;
const fallback = labels.filter(user => user.label.startsWith("user-")).length;
const summary = {labels,empty,fallback};
console.log(JSON.stringify(summary));
