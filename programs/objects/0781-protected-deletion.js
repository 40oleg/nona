const removed = [];
const account = new Proxy({ id: "A7", nickname: "Ada", temporary: true }, {
  deleteProperty(target, key) {
    if (key === "id") return false;
    removed.push(key); return Reflect.deleteProperty(target, key);
  }
});
const results = [Reflect.deleteProperty(account, "id"), Reflect.deleteProperty(account, "temporary")];
console.log(JSON.stringify({ account, removed, results }));
