class Auction {
  #winner = null;
  #price;
  constructor(reserve) { this.#price = reserve; this.open = true; }
  bid(name, amount) {
    if (!this.open || amount <= this.#price) return false;
    this.#winner = name; this.#price = amount; return true;
  }
  close() { this.open = false; return { winner: this.#winner, price: this.#price }; }
}
const auction = new Auction(10);
const bids = [auction.bid("A", 12), auction.bid("B", 11), auction.bid("C", 17)];
console.log(JSON.stringify([bids, auction.close(), auction.bid("D", 20)]));
