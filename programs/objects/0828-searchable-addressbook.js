class AddressBook {
  #contacts = [];
  add(name, city) { this.#contacts.push(Object.freeze({ name, city })); }
  search(query) { const text = query.toLowerCase(); return this.#contacts.filter(contact => Object.values(contact).some(value => value.toLowerCase().includes(text))); }
  groupByCity() { const groups = {}; for (const contact of this.#contacts) (groups[contact.city] ??= []).push(contact.name); return groups; }
}
const book = new AddressBook(); book.add("Ada", "York"); book.add("Lin", "York"); book.add("Max", "Rome");
console.log(JSON.stringify({
  search: book.search("or"),
  groups: book.groupByCity()
}));
