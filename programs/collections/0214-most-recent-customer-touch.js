const contacts = ["Ada","Bo","Cy","Ada","Dee","Bo"];
const recent = new Map();
contacts.forEach((name,index) => {
  recent.delete(name);
  recent.set(name,index);
});
const chronology = Array.from(recent.keys());
const latest = chronology[chronology.length-1];
const untouched = ["Ada","Bo","Cy","Dee","Eli"].filter(name => !recent.has(name));
console.log(JSON.stringify({chronology,latest,untouched}));
