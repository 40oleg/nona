class Workflow {
  constructor(stages) { this.stages = stages; this.closed = false; }
  run(initial) {
    let context = {...initial}; const completed = [];
    try {
      for (const {name,run} of this.stages) { context = {...context,...run(context)}; completed.push(name); }
      return {context,completed};
    } catch(error) { return {context,completed,error:error.message}; }
    finally { this.closed = true; }
  }
}
const flow = new Workflow([{name:'load',run:() => ({items:[2,3]})},{name:'sum',run:({items}) => ({total:items.reduce((a,b) => a+b,0)})},{name:'verify',run:({total}) => {if (total < 10) throw new Error('minimum'); return {};}}]);
console.log(JSON.stringify({result:flow.run({owner:'Ada'}),closed:flow.closed}));
