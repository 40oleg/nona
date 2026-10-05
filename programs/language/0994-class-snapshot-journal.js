class Journal {
  constructor(state) { this.state = {...state}; this.snapshots = []; }
  save(label) { this.snapshots.push({label,state:{...this.state}}); }
  change({field,value}) { this.state[field] = value; }
}
const journal = new Journal({count:1,name:'draft'});
journal.save('start'); journal.change({field:'count',value:4}); journal.save('middle'); journal.change({field:'name',value:'done'});
const labels = journal.snapshots.map(({label}) => label);
console.log(JSON.stringify({state:journal.state,snapshots:journal.snapshots,labels}));
console.log(journal.snapshots[0].state.count);
