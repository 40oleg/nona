class Redactor {
  constructor(words) { this.words = new Set(words); }
  [Symbol.replace](text, marker) {
    return text.split(" ").map(word => this.words.has(word.toLowerCase()) ? marker : word).join(" ");
  }
}
const redactor = new Redactor(["secret", "token"]);
const lines = ["keep SECRET safe", "token is hidden", "ordinary text"];
console.log(JSON.stringify(lines.map(line => line.replace(redactor, "[redacted]"))));
