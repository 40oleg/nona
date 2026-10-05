async function main() {
  const participants = [{ name: 'stock', state: 'new' }, { name: 'payment', state: 'new' }];
  await Promise.all(participants.map(async participant => {
    await Promise.resolve();
    participant.state = 'prepared';
  }));
  if (!participants.every(participant => participant.state === 'prepared')) throw new Error('prepare failed');
  for (const participant of participants) {
    await Promise.resolve();
    participant.state = 'committed';
  }
  console.log(JSON.stringify(participants));
}
main().catch(error => { throw error; });
