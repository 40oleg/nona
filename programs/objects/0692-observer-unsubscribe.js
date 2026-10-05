class Topic {
  #listeners = new Set();
  subscribe(fn) { this.#listeners.add(fn); return () => this.#listeners.delete(fn); }
  publish(value) { for (const fn of [...this.#listeners]) fn(value); }
}
const topic = new Topic();
const log = [];
const stop = topic.subscribe(value => log.push("A" + value));
topic.subscribe(value => log.push("B" + value));
topic.publish(1);
stop();
topic.publish(2);
console.log(JSON.stringify(log));
