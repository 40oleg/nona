class Room {
  constructor() { this.members = []; }
  join(member) { member.room = this; this.members.push(member); }
  broadcast(sender, text) { for (const member of this.members) if (member !== sender) member.messages.push(sender.name + ":" + text); }
}
class Participant {
  constructor(name) { this.name = name; this.messages = []; }
  send(text) { this.room.broadcast(this, text); }
}
const room = new Room(), a = new Participant("A"), b = new Participant("B"), c = new Participant("C");
for (const person of [a, b, c]) room.join(person); a.send("hello"); b.send("reply");
console.log(JSON.stringify([a.messages, b.messages, c.messages]));
