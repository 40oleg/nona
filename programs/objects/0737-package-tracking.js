class Parcel {
  #state = "packed";
  #history = ["packed"];
  move(next) {
    const allowed = { packed: ["shipped"], shipped: ["delivered", "returned"], delivered: [], returned: [] };
    if (!allowed[this.#state].includes(next)) return false;
    this.#state = next; this.#history.push(next); return true;
  }
  toJSON() { return this.#history; }
}
const parcel = new Parcel();
console.log(JSON.stringify([parcel.move("delivered"), parcel.move("shipped"), parcel.move("returned"), parcel.move("shipped"), parcel]));
