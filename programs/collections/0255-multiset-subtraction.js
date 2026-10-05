const pantry = new Map([["egg",6],["flour",4],["milk",2]]);
const consumed = [["egg",2],["flour",3],["egg",3],["salt",1]];
const missing = [];
for (const [item,qty] of consumed) {
  const available = pantry.get(item)||0;
  if (qty>available) missing.push([item,qty-available]);
  pantry.set(item,Math.max(0,available-qty));
}
const remaining = Array.from(pantry).filter(([,qty]) => qty>0);
console.log(JSON.stringify({remaining,missing}));
