class Alphabet {
  static letters = "abcd";
  static index;
  static {
    this.index = Object.create(null);
    for (let i = 0; i < this.letters.length; i++) this.index[this.letters[i]] = i;
    Object.freeze(this.index);
  }
  static locate(word) { return [...word].map(letter => this.index[letter] ?? -1); }
}
console.log(JSON.stringify([Alphabet.locate("badz"), Object.isFrozen(Alphabet.index)]));
