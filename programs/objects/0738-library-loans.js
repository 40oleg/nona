class Library {
  #books = new Map();
  add(title) { this.#books.set(title, { borrower: null, renewals: 0 }); }
  borrow(title, person) {
    const book = this.#books.get(title);
    if (!book || book.borrower) return false;
    book.borrower = person; return true;
  }
  renew(title, person) { const book = this.#books.get(title); if (book?.borrower !== person || book.renewals === 1) return false; book.renewals++; return true; }
  toJSON() { return Object.fromEntries(this.#books); }
}
const library = new Library(); library.add("Algorithms"); library.borrow("Algorithms", "A");
console.log(JSON.stringify([library.renew("Algorithms", "A"), library.renew("Algorithms", "A"), library]));
