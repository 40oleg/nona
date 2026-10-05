class Draft {
  constructor(target) {
    this.target = target; this.patch = {};
    this.view = new Proxy(target, { get: (object, key) => Object.hasOwn(this.patch, key) ? this.patch[key] : Reflect.get(object, key), set: (object, key, value) => { this.patch[key] = value; return true; } });
  }
  commit() { Object.assign(this.target, this.patch); this.patch = {}; }
  rollback() { this.patch = {}; }
}
const target = { title: "draft", count: 1 }, draft = new Draft(target);
draft.view.count = 2; const staged = [target.count, draft.view.count]; draft.rollback();
draft.view.title = "published"; draft.commit();
console.log(JSON.stringify([staged, target, draft.view.count]));
