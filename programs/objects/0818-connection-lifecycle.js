class Connection {
  #state = "new";
  #sent = [];
  open() { if (this.#state !== "new") return false; this.#state = "open"; return true; }
  send(packet) { if (this.#state !== "open") return false; this.#sent.push(packet); return true; }
  close() { this.#state = "closed"; }
  toJSON() { return { state: this.#state, sent: this.#sent }; }
}
const connection = new Connection();
const results = [connection.send("early"), connection.open(), connection.send("data")]; connection.close();
results.push(connection.send("late"), connection.open());
console.log(JSON.stringify([results, connection]));
