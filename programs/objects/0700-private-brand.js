class Credential {
  #permissions;
  constructor(permissions) { this.#permissions = new Set(permissions); }
  static permits(value, action) { return #permissions in value && value.#permissions.has(action); }
}
class Archive {
  #records = ["draft"];
  append(credential, text) {
    if (!Credential.permits(credential, "write")) return "denied";
    this.#records.push(text); return "stored";
  }
  toJSON() { return this.#records; }
}
const archive = new Archive();
const writer = new Credential(["read", "write"]);
const reader = new Credential(["read"]);
const imitation = Object.create(Credential.prototype);
console.log(JSON.stringify([archive.append(reader, "no"), archive.append(imitation, "fake"), archive.append(writer, "approved"), archive]));
