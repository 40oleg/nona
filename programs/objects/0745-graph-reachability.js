class Station {
  constructor(name) { this.name = name; this.links = new Set(); }
  connect(other) { this.links.add(other); other.links.add(this); }
  reachable() {
    const seen = new Set([this]), queue = [this];
    for (let i = 0; i < queue.length; i++) for (const next of queue[i].links) if (!seen.has(next)) { seen.add(next); queue.push(next); }
    return [...seen].map(station => station.name).sort();
  }
}
const a = new Station("A"), b = new Station("B"), c = new Station("C"), d = new Station("D");
a.connect(b); b.connect(c); c.connect(a);
console.log(JSON.stringify([a.reachable(), d.reachable()]));
