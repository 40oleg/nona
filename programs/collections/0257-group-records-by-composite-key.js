const records = [{site:"e",sku:"a",qty:2},{site:"w",sku:"a",qty:4},{site:"e",sku:"a",qty:3},{site:"e",sku:"b",qty:1}];
const totals = new Map();
for (const {site,sku,qty} of records) {
  const key = `${site}/${sku}`;
  totals.set(key,(totals.get(key)||0)+qty);
}
const output = Array.from(totals,([key,qty]) => {
  const [site,sku] = key.split("/");
  return {site,sku,qty};
});
console.log(JSON.stringify(output));
