class Role {
  constructor(name, permissions, parent = null) { Object.assign(this, { name, permissions: new Set(permissions), parent }); }
  permits(action) { return this.permissions.has(action) || (this.parent?.permits(action) ?? false); }
  describe(actions) { return Object.fromEntries(actions.map(action => [action, this.permits(action)])); }
}
const reader = new Role("reader", ["read"]);
const editor = new Role("editor", ["write"], reader);
const admin = new Role("admin", ["delete"], editor);
console.log(JSON.stringify({
  editor: editor.describe(["read", "write", "delete"]),
  admin: admin.describe(["read", "delete"])
}));
