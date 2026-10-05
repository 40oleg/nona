function meter() {
  let segment = [], archived = [];
  return {
    record({label,value}) { segment.push({label,value}); },
    flush() { archived.push(segment.reduce((sum,row) => sum+row.value,0)); segment = []; },
    report() { return {archived:[...archived],pending:segment.length}; }
  };
}
const m = meter();
m.record({label:'a',value:2}); m.record({label:'b',value:5}); m.flush(); m.record({label:'c',value:4});
console.log(JSON.stringify(m.report()));
