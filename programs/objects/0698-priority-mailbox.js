class Mailbox {
  #messages = [];
  put(text, priority) { this.#messages.push({ text, priority }); }
  take() {
    this.#messages.sort((a, b) => b.priority - a.priority);
    return this.#messages.shift()?.text ?? "empty";
  }
}
const box = new Mailbox();
box.put("normal", 1); box.put("urgent", 9); box.put("later", 0);
console.log(JSON.stringify([box.take(), box.take(), box.take(), box.take()]));
