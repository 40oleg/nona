const names = [" Ada ","BO","ada","Cy","bo","CY "];
const seen = new Set();
const unique = names.filter(name => {
  const key = name.trim().toLowerCase();
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
}).map(name => name.trim());
const initials = unique.map(name => name[0]).join("");
console.log(JSON.stringify({unique,initials}));
