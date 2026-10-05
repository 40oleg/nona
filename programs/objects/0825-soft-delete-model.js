class Catalog {
  constructor(items) { this.items = items.map(item => ({ ...item, deleted: false })); }
  remove(id) { const item = this.items.find(item => item.id === id); if (item) item.deleted = true; }
  restore(id) { const item = this.items.find(item => item.id === id); if (item) item.deleted = false; }
  get visible() { return this.items.filter(item => !item.deleted).map(({ deleted, ...item }) => item); }
}
const catalog = new Catalog([{ id: 1, name: "A" }, { id: 2, name: "B" }]);
catalog.remove(1); const hidden = catalog.visible; catalog.restore(1);
console.log(JSON.stringify({
  hidden,
  restored: catalog.visible
}));
