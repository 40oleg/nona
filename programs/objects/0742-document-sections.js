class Section {
  constructor(title, paragraphs = []) { this.title = title; this.paragraphs = paragraphs; }
  get words() { return this.paragraphs.join(" ").split(/\s+/).filter(Boolean).length; }
  toJSON() { return { title: this.title, words: this.words }; }
}
class Manuscript {
  constructor(sections) { this.sections = sections; }
  get wordCount() { return this.sections.reduce((n, section) => n + section.words, 0); }
}
const book = new Manuscript([new Section("Intro", ["one two", "three"]), new Section("End", ["four five"])]);
console.log(JSON.stringify([book.sections, book.wordCount]));
