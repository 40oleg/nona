const source = new Map([["a",1],["b",2],["c",3],["d",4],["e",5]]);
const iterator = source.entries();
const pages = [];
let page = [];
for (let step=iterator.next();!step.done;step=iterator.next()) {
  page.push(step.value);
  if (page.length===2) { pages.push(page); page=[]; }
}
if (page.length) pages.push(page);
console.log(JSON.stringify(pages));
