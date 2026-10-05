class Store {
  constructor(rows) { this.rows = rows; }
  get(id) { return this.rows.find(row => row.id === id); }
}
class Presenter {
  constructor(store,format) { this.store = store; this.format = format; }
  show(id) { const row = this.store.get(id); return row ? this.format(row) : 'missing'; }
}
const presenter = new Presenter(new Store([{id:1,name:'Ada'}]),({name}) => name.toUpperCase());
console.log(presenter.show(1));
console.log(presenter.show(2));
console.log(presenter.store.get(2)?.name ?? 'none');
