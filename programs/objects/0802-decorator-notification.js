class Notification {
  constructor(text) { this.text = text; }
  render() { return this.text; }
}
class Prefix {
  constructor(inner, prefix) { this.inner = inner; this.prefix = prefix; }
  render() { return this.prefix + this.inner.render(); }
}
class Uppercase {
  constructor(inner) { this.inner = inner; }
  render() { return this.inner.render().toUpperCase(); }
}
const notice = new Prefix(new Uppercase(new Notification("build ready")), "INFO: ");
console.log(notice.render());
