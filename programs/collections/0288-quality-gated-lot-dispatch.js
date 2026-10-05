const events = [{kind:"produce",lot:"a",qty:10},{kind:"ship",lot:"a",qty:2},{kind:"inspect",lot:"a",pass:0.8},{kind:"ship",lot:"a",qty:5},{kind:"produce",lot:"b",qty:4},{kind:"inspect",lot:"b",pass:0.5},{kind:"ship",lot:"b",qty:3},{kind:"ship",lot:"a",qty:4}];
const lots = new Map();
const shipments = [];
for (const event of events) {
  if (event.kind==="produce") lots.set(event.lot,{qty:event.qty,released:false,rejected:0});
  const lot = lots.get(event.lot);
  if (event.kind==="inspect") {
    const accepted = Math.floor(lot.qty*event.pass);
    lot.rejected=lot.qty-accepted;
    lot.qty=accepted;
    lot.released=true;
  }
  if (event.kind==="ship") {
    const allowed = lot.released && lot.qty>=event.qty;
    if (allowed) lot.qty-=event.qty;
    shipments.push({lot:event.lot,qty:event.qty,allowed});
  }
}
console.log(JSON.stringify({shipments,lots:Array.from(lots)}));
