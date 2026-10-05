const teams = {
  billing:{accept:({amount}) => amount < 100,assign:() => 'accounts'},
  technical:{accept:({severity}) => severity < 3,assign:({product}) => product+'-desk'}
};
const queues = {}, escalated = [];
function route(ticket) {
  const policy = teams[ticket.kind];
  if (!(policy?.accept?.(ticket) ?? false)) { escalated.push(ticket.id); return; }
  const owner = policy.assign?.(ticket) ?? 'general';
  (queues[owner] ??= []).push(ticket.id);
}
for (const ticket of [{id:'A',kind:'billing',amount:20},{id:'B',kind:'technical',severity:2,product:'editor'},{id:'C',kind:'billing',amount:140},{id:'D',kind:'unknown'}]) route(ticket);
console.log(JSON.stringify({queues,escalated}));
