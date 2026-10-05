class Folder {
  constructor(name) { this.name = name; this.items = []; }
  add(item) { if (item.parent) item.parent.items.splice(item.parent.items.indexOf(item), 1); item.parent = this; this.items.push(item); }
  list() { return this.items.map(item => item.name).sort(); }
}
const inbox = new Folder("inbox"), archive = new Folder("archive");
const document = { name: "notes", parent: null };
const image = { name: "photo", parent: null };
for (const item of [document, image]) inbox.add(item);
archive.add(document);
console.log(JSON.stringify([inbox.list(), archive.list(), document.parent.name]));
