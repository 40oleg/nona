const bookings = [{id:"a",room:1,start:1,end:4},{id:"b",room:1,start:3,end:5},{id:"c",room:1,start:5,end:7},{id:"d",room:2,start:2,end:6}];
const conflicts = [];
for (let i=0;i<bookings.length;i++) {
  for (let j=i+1;j<bookings.length;j++) {
    const a = bookings[i];
    const b = bookings[j];
    if (a.room===b.room && a.start<b.end && b.start<a.end) conflicts.push([a.id,b.id]);
  }
}
const usedRooms = new Set(bookings.map(booking => booking.room));
console.log(JSON.stringify({conflicts,rooms:usedRooms.size}));
