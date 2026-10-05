async function main() {
  const escrow = { held: 60, paid: 0 };
  const approvals = [true, false, true];
  const report = [];
  for (let milestone = 0; milestone < approvals.length; milestone++) {
    const approved = await Promise.resolve(approvals[milestone]);
    if (approved) { escrow.held -= 20; escrow.paid += 20; }
    report.push(milestone + ':' + (approved ? 'paid' : 'held'));
  }
  if (escrow.held + escrow.paid !== 60) throw new Error('escrow invariant');
  console.log(JSON.stringify([escrow, report]));
}
main().catch(error => { throw error; });
