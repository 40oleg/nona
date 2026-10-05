class Session {
  #remaining;
  #user;
  constructor(user, uses) { this.#user = user; this.#remaining = uses; }
  access() { if (!this.#remaining) return "expired"; this.#remaining--; return "hello:" + this.#user; }
  renew(uses) { this.#remaining = Math.max(this.#remaining, uses); }
  get remaining() { return this.#remaining; }
}
const session = new Session("Ada", 2);
const log = [session.access(), session.access(), session.access()];
session.renew(1); log.push(session.access(), session.remaining);
console.log(JSON.stringify(log));
