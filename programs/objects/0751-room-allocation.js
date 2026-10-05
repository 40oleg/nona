class Room {
  constructor(name, capacity) { this.name = name; this.capacity = capacity; this.groups = []; }
  get free() { return this.capacity - this.groups.reduce((n, group) => n + group.size, 0); }
  admit(group) { if (group.size > this.free) return false; this.groups.push(group); return true; }
}
const rooms = [new Room("small", 3), new Room("large", 6)];
const assignments = [];
for (const group of [{ name: "A", size: 2 }, { name: "B", size: 4 }, { name: "C", size: 3 }]) {
  const room = rooms.find(room => room.free >= group.size);
  assignments.push([group.name, room?.name ?? "wait"]); room?.admit(group);
}
console.log(JSON.stringify([assignments, rooms.map(room => room.free)]));
