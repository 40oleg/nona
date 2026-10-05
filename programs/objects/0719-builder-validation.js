class RouteBuilder {
  constructor() { this.parts = []; }
  segment(name) { this.parts.push(encodeURIComponent(name)); return this; }
  build() {
    if (!this.parts.length) throw new Error("empty route");
    return "/" + this.parts.join("/");
  }
}
const builder = new RouteBuilder().segment("users").segment("Ada Lane");
console.log(JSON.stringify([builder.build(), builder.segment("files").build()]));
