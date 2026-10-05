class ReviewSession {
  constructor(document) {
    const handle = Proxy.revocable(document, { get(target, key) { return Reflect.get(target, key); } });
    this.view = handle.proxy; this.end = handle.revoke;
  }
  preview() { return this.view.title + ":" + this.view.body.slice(0, 5); }
}
const session = new ReviewSession({ title: "Draft", body: "Opening text" });
const log = [session.preview()];
session.end();
try { log.push(session.preview()); }
catch (error) { log.push(error instanceof TypeError ? "session ended" : "unexpected"); }
console.log(JSON.stringify(log));
