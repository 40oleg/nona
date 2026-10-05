const rows = [{name:'Ada',score:4},{name:'Bo',score:6}];
const snapshots = rows.map(({name,score,...details}) => {
  const saved = {...details};
  return bonus => ({name,total:score+bonus,...saved});
});
rows[0].name = 'changed'; rows[1].score = 100;
const report = snapshots.map(read => read(2));
console.log(JSON.stringify(report));
console.log(JSON.stringify(rows));
console.log(report[0].name);
