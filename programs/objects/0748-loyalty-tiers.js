class Member {
  #points = 0;
  constructor(name) { this.name = name; }
  purchase(amount) { this.#points += Math.floor(amount / 10); }
  get tier() { return this.#points >= 10 ? "gold" : this.#points >= 5 ? "silver" : "basic"; }
  redeem(points) { if (points > this.#points) return false; this.#points -= points; return true; }
  toJSON() { return { name: this.name, points: this.#points, tier: this.tier }; }
}
const member = new Member("Lin"); member.purchase(79); member.purchase(35);
const before = JSON.stringify(member); member.redeem(6);
console.log(JSON.stringify([JSON.parse(before), member]));
