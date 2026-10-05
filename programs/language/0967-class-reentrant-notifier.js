class Notifier {
  constructor(listener) { this.listener = listener; this.queue = []; this.busy = false; }
  emit(value) {
    this.queue.push(value); if (this.busy) return;
    this.busy = true;
    try { while (this.queue.length) this.listener(this.queue.shift()); }
    finally { this.busy = false; }
  }
}
const trace = [];
const notifier = new Notifier(value => { trace.push(value); if (value === 1) notifier.emit(2); trace.push(-value); });
notifier.emit(1);
console.log(JSON.stringify(trace));
