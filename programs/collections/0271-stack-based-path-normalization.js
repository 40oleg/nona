const path = "/home/./user/../docs//notes/../readme";
const stack = [];
for (const segment of path.split("/")) {
  if (segment==="" || segment===".") continue;
  if (segment==="..") stack.pop();
  else stack.push(segment);
}
const normalized = "/"+stack.join("/");
const depth = stack.length;
console.log(JSON.stringify({normalized,depth}));
