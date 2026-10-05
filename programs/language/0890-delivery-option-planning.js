let fallbackLookups = 0;
const defaultZone = customer => { fallbackLookups++; return customer === 'Ada' ? 'local' : 'remote'; };
function plan({customer,parcel:{weight},delivery:{zone=defaultZone(customer),express=false} = {}}) {
  if (weight <= 0) throw new Error('weight');
  const base = zone === 'local' ? 3 : 8;
  return {customer,zone,charge:base+weight*(express ? 4 : 2),service:express ? 'priority' : 'standard'};
}
const shipments = [{customer:'Ada',parcel:{weight:2}},{customer:'Bo',parcel:{weight:3},delivery:{zone:'local',express:true}},{customer:'Cy',parcel:{weight:0}}];
const plans = [], rejected = [];
for (const shipment of shipments) {
  try { plans.push(plan(shipment)); } catch(error) { rejected.push(shipment.customer+':'+error.message); }
}
console.log(JSON.stringify({plans,rejected,fallbackLookups}));
