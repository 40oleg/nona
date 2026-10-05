const kits = new Map([["starter",[["bolt",2],["plate",1]]],["repair",[["bolt",3],["nut",3]]]]);
const orders = [["starter",4],["repair",2]];
const needed = new Map();
for (const [kit,count] of orders) {
  for (const [part,quantity] of kits.get(kit)) {
    needed.set(part,(needed.get(part)||0)+quantity*count);
  }
}
const totals = Array.from(needed).sort((a,b) => a[0].localeCompare(b[0]));
console.log(JSON.stringify(totals));
