class Handler {
  constructor(test, action, next = null) { Object.assign(this, { test, action, next }); }
  handle(request) { return this.test(request) ? this.action(request) : this.next?.handle(request) ?? "unhandled"; }
}
const fallback = new Handler(() => true, request => "unknown:" + request.kind);
const read = new Handler(r => r.kind === "read", r => "value:" + r.key, fallback);
const secure = new Handler(r => !r.authorized, () => "denied", read);
const requests = [{ kind: "read", key: "x", authorized: true }, { kind: "read", authorized: false }, { kind: "ping", authorized: true }];
console.log(JSON.stringify(requests.map(request => secure.handle(request))));
