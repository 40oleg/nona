const tickets = [{id:"a",age:2},{id:"b",age:12},{id:"c",age:7},{id:"d",age:1},{id:"e",age:20}];
const buckets = new Map([["fresh",[]],["aging",[]],["overdue",[]]]);
for (const ticket of tickets) {
  const bucket = ticket.age<3 ? "fresh" : ticket.age<10 ? "aging" : "overdue";
  buckets.get(bucket).push(ticket.id);
}
const report = Array.from(buckets).map(([name,ids]) => ({name,ids,count:ids.length}));
const overdue = buckets.get("overdue").length;
const result = {report,overdue};
console.log(JSON.stringify(result));
