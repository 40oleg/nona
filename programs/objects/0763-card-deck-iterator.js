class Deck {
  constructor(suits, ranks) { this.suits = suits; this.ranks = ranks; }
  *[Symbol.iterator]() {
    for (const suit of this.suits) for (const rank of this.ranks) yield rank + suit;
  }
  deal(count) {
    const cards = [];
    for (const card of this) { cards.push(card); if (cards.length === count) break; }
    return cards;
  }
}
console.log(JSON.stringify(new Deck(["H", "S"], ["A", "K", "Q"]).deal(4)));
