const query = "tag=red&page=2&tag=blue&empty=&tag=red";
const params = new Map();
for (const pair of query.split("&")) {
  const [key,value] = pair.split("=");
  if (!params.has(key)) params.set(key,[]);
  params.get(key).push(value);
}
const tags = new Set(params.get("tag"));
const page = Number(params.get("page")[0]);
console.log(JSON.stringify({params:Array.from(params),tags:Array.from(tags),page}));
