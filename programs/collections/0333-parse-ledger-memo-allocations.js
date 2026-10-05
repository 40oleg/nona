const memos = ["a:12;b:3","b:7;c:-2","a:bad;d:5"];
const totals = new Map();
const invalid = [];
for (const memo of memos) for (const field of memo.split(";")) {
  const [account,text] = field.split(":");
  const amount = Number(text);
  if (!Number.isFinite(amount)) invalid.push(field);
  else totals.set(account,(totals.get(account)||0)+amount);
}
console.log(JSON.stringify({totals:Array.from(totals),invalid}));
