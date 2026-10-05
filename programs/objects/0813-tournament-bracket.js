class Player {
  constructor(name, strength) { Object.assign(this, { name, strength }); }
  play(other) { return this.strength >= other.strength ? this : other; }
}
class Tournament {
  constructor(players) { this.players = players; this.rounds = []; }
  run() { let players = this.players; while (players.length > 1) { const winners = []; for (let i = 0; i < players.length; i += 2) winners.push(players[i].play(players[i + 1])); this.rounds.push(winners.map(p => p.name)); players = winners; } return players[0].name; }
}
const tournament = new Tournament([new Player("A", 3), new Player("B", 7), new Player("C", 9), new Player("D", 4)]);
console.log(JSON.stringify([tournament.run(), tournament.rounds]));
