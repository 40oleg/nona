const books = new Map([["atlas",{borrower:null,holds:[]}],["novel",{borrower:null,holds:[]}]]);
const events = [["checkout","atlas","Ada"],["hold","atlas","Bo"],["hold","atlas","Cy"],["return","atlas","Dee"],["return","atlas","Ada"],["checkout","atlas","Dee"],["return","atlas","Bo"]];
const audit = [];
for (const [action,title,reader] of events) {
  const book = books.get(title);
  let accepted = false;
  if (action==="hold" && book.borrower!==reader && !book.holds.includes(reader)) {
    book.holds.push(reader);
    accepted=true;
  } else if (action==="checkout" && book.borrower===null) {
    book.borrower=reader;
    accepted=true;
  } else if (action==="return" && book.borrower===reader) {
    book.borrower=book.holds.shift()??null;
    accepted=true;
  }
  audit.push([action,reader,accepted,book.borrower]);
}
console.log(JSON.stringify({audit,books:Array.from(books)}));
