class Version {
  constructor(text) { this.parts = text.split(".").map(Number); }
  compare(other) { for (let i = 0; i < 3; i++) { const difference = (this.parts[i] ?? 0) - (other.parts[i] ?? 0); if (difference) return Math.sign(difference); } return 0; }
  bumpMinor() { return new Version([this.parts[0], (this.parts[1] ?? 0) + 1, 0].join(".")); }
  toJSON() { return this.parts.join("."); }
}
const current = new Version("2.9.4"), next = current.bumpMinor();
console.log(JSON.stringify({
  current, next,
  ordering: current.compare(next), equal: new Version("2.9").compare(new Version("2.9.0"))
}));
