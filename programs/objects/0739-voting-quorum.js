class Ballot {
  #votes = new Map();
  constructor(members) { this.members = new Set(members); }
  vote(person, yes) { if (!this.members.has(person)) return false; this.#votes.set(person, Boolean(yes)); return true; }
  get result() {
    const yes = [...this.#votes.values()].filter(Boolean).length;
    return { cast: this.#votes.size, passed: this.#votes.size >= 3 && yes > this.#votes.size / 2 };
  }
}
const ballot = new Ballot(["a", "b", "c", "d"]);
for (const [name, yes] of [["a", true], ["b", false], ["c", true]]) ballot.vote(name, yes);
console.log(JSON.stringify([ballot.vote("x", true), ballot.result]));
