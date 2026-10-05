const students = new Map([[1,"Ada"],[2,"Bo"],[3,"Cy"]]);
const courses = [{name:"math",students:[1,3]},{name:"art",students:[2,3,9]}];
const joined = courses.flatMap(course => {
  return course.students.map(id => ({course:course.name,student:students.get(id) ?? "unknown"}));
});
const valid = joined.filter(row => row.student!=="unknown");
const distinct = new Set(valid.map(row => row.student));
const missing = joined.length-valid.length;
const report = {joined,students:distinct.size,missing};
console.log(JSON.stringify(report));
