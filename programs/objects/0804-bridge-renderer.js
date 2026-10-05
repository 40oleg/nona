class Diagram {
  constructor(renderer) { this.renderer = renderer; this.nodes = []; }
  add(label) { this.nodes.push(label); return this; }
  render() { return this.nodes.map(label => this.renderer.node(label)).join(this.renderer.separator); }
}
const plain = { node: label => "[" + label + "]", separator: " -> " };
const compact = { node: label => label.toLowerCase(), separator: "/" };
const diagram = new Diagram(plain).add("Start").add("End");
const first = diagram.render(); diagram.renderer = compact;
console.log(JSON.stringify([first, diagram.render()]));
