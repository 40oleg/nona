let closed = false;
function* pages(items, width) {
  try {
    for (let offset = 0; offset < items.length; offset += width) {
      yield items.slice(offset,offset + width);
    }
  } finally { closed = true; }
}
const reader = pages([2,4,6,8,10],2);
const {value:first} = reader.next();
reader.return();
console.log(JSON.stringify({first,closed}));
