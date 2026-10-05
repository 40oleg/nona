class Deck {
  constructor(...cards) { this.cards = cards; }
  *[Symbol.iterator]() {
    for (const card of this.cards) if (!card.hidden) yield card.name;
  }
  hide(name) { const card = this.cards.find(card => card.name === name); if (card) card.hidden = true; }
}
const deck = new Deck({name:'A'},{name:'B'},{name:'C',hidden:true});
deck.hide('B');
console.log(JSON.stringify([...deck]));
console.log(deck.cards.length);
