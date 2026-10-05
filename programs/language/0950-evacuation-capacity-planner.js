function evacuate(parties,capacity) {
  const reservations = [], boarded = [], refused = [];
  let remaining = capacity, active = false;
  const reserve = ({name,size}) => { if (size > remaining) throw new Error('capacity'); remaining -= size; reservations.push(name); };
  try {
    active = true;
    for (const party of parties) {
      try { reserve(party); boarded.push(party.name); }
      catch(error) { refused.push({name:party.name,reason:error.message}); }
    }
  } finally { reservations.length = 0; active = false; }
  return {boarded,refused,remaining,active,reservations};
}
console.log(JSON.stringify(evacuate([{name:'north',size:3},{name:'east',size:4},{name:'west',size:2}],6)));
