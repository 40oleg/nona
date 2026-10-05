class Request {
  #approvers = new Set();
  #status = "pending";
  constructor(required) { this.required = required; }
  approve(name) {
    if (this.#status !== "pending") return false;
    this.#approvers.add(name);
    if (this.#approvers.size >= this.required) this.#status = "approved";
    return true;
  }
  toJSON() { return { status: this.#status, approvers: [...this.#approvers] }; }
}
const request = new Request(2);
request.approve("Ada"); request.approve("Ada"); request.approve("Lin");
console.log(JSON.stringify([request.approve("Max"), request]));
