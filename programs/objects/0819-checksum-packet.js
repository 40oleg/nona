class Packet {
  constructor(payload) { this.payload = payload.slice(); this.checksum = this.payload.reduce((sum, n) => (sum + n) % 256, 0); }
  get valid() { return this.checksum === this.payload.reduce((sum, n) => (sum + n) % 256, 0); }
  toJSON() { return { payload: this.payload, checksum: this.checksum, valid: this.valid }; }
}
const packet = new Packet([120, 140, 3]);
const before = JSON.stringify(packet);
packet.payload[1] = 141;
console.log(JSON.stringify({
  before: JSON.parse(before),
  after: packet
}));
