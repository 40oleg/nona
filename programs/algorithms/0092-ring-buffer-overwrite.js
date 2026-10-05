class Ring {
  constructor(capacity) { this.data = Array(capacity); this.next = 0; this.size = 0; this.dropped = 0; }
  write(value) { if (this.size === this.data.length) this.dropped++; else this.size++; this.data[this.next] = value; this.next = (this.next + 1) % this.data.length; }
  read() { const start = (this.next - this.size + this.data.length) % this.data.length; return Array.from({length: this.size}, (_, i) => this.data[(start + i) % this.data.length]); }
}
const readings = new Ring(3); [10, 11, 12, 13, 14].forEach(v => readings.write(v));
if (readings.read().join(',') !== '12,13,14') throw new Error('ring chronology');
console.log(readings.dropped + ':' + readings.read().join(','));
