const shortlist = ["Cy","Ada","Bo","Dee"];
const panel = new Set(["Bo","Dee","Eli","Ada"]);
const shared = shortlist.filter(name => panel.has(name));
const ranks = shared.map(name => {
  return {name,rank:shortlist.indexOf(name)+1};
});
const rejected = shortlist.filter(name => !panel.has(name));
const firstChoice = shared[0] ?? "none";
const report = {ranks,rejected,firstChoice};
console.log(JSON.stringify(report));
