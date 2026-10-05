class Menu {
  constructor(label, enabled = true, children = []) { Object.assign(this, { label, enabled, children }); }
  prune() { return this.enabled ? new Menu(this.label, true, this.children.map(child => child.prune()).filter(Boolean)) : null; }
  toJSON() { return { label: this.label, children: this.children }; }
  get leaves() { return this.children.length ? this.children.flatMap(child => child.leaves) : [this.label]; }
}
const menu = new Menu("root", true, [new Menu("Open"), new Menu("Admin", false), new Menu("Tools", true, [new Menu("Export")])]);
const visible = menu.prune();
console.log(JSON.stringify([visible, visible.leaves]));
