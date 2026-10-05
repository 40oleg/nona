class Trie {
  constructor() { this.root = { children: new Map(), terminal: false }; }
  add(word) { let node = this.root; for (const char of word) { if (!node.children.has(char)) node.children.set(char, { children: new Map(), terminal: false }); node = node.children.get(char); } node.terminal = true; }
  words(prefix) {
    let node = this.root; for (const char of prefix) { node = node.children.get(char); if (!node) return []; }
    const result = [];
    function visit(current, text) { if (current.terminal) result.push(text); for (const [char, child] of current.children) visit(child, text + char); }
    visit(node, prefix); return result.sort();
  }
}
const trie = new Trie(); for (const word of ["cat", "car", "cart", "dog"]) trie.add(word);
console.log(JSON.stringify([trie.words("car"), trie.words("z")]));
