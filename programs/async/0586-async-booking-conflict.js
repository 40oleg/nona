async function main() {
  const bookings = [{ start: 2, end: 5 }];
  const outcomes = [];
  for (const booking of [{ start: 4, end: 7 }, { start: 5, end: 8 }]) {
    try {
      await Promise.resolve();
      if (bookings.some(old => booking.start < old.end && old.start < booking.end)) throw new Error('overlap');
      bookings.push(booking);
      outcomes.push('accepted');
    } catch (error) { outcomes.push(error.message); }
  }
  console.log(JSON.stringify([bookings, outcomes]));
}
main().catch(error => { throw error; });
