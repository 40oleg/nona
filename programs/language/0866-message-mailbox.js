class Mailbox {
  constructor(items) { this.items = items; }
  *receive(tag) {
    const retained = [];
    for (const message of this.items) {
      if (message.tag === tag) yield message.value; else retained.push(message);
    }
    this.items = retained;
  }
}
const mailbox = new Mailbox([{tag:'job',value:2},{tag:'note',value:9},{tag:'job',value:4}]);
const values = [...mailbox.receive('job')];
console.log(JSON.stringify({values,left:mailbox.items}));
