class Store {
  #state;
  #subscriptions = [];
  constructor(state) { this.#state = state; }
  subscribe(select, notify) { this.#subscriptions.push({ select, notify, previous: select(this.#state) }); }
  update(patch) {
    this.#state = { ...this.#state, ...patch };
    for (const subscription of this.#subscriptions) { const next = subscription.select(this.#state); if (!Object.is(next, subscription.previous)) { subscription.notify(next); subscription.previous = next; } }
  }
}
const store = new Store({ count: 0, name: "A" }), log = [];
store.subscribe(state => state.count, value => log.push(value));
store.update({ name: "B" }); store.update({ count: 2 }); store.update({ count: 2 }); store.update({ count: 3 });
console.log(JSON.stringify(log));
