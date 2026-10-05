const weights = new Map([["quiz",2],["exam",5],["lab",3]]);
const students = [{name:"Ada",scores:{quiz:8,exam:9,lab:7}},{name:"Bo",scores:{quiz:6,exam:8}}];
const results = students.map(student => {
  let points = 0;
  let weight = 0;
  for (const [task,w] of weights) {
    if (task in student.scores) { points += student.scores[task]*w; weight += w; }
  }
  return {name:student.name,grade:points/weight,complete:Object.keys(student.scores).length===weights.size};
});
console.log(JSON.stringify(results));
