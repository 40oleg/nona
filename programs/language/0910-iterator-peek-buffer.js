function peekable(iterator) {
  let buffered = null;
  return {
    peek() { buffered ??= iterator.next(); return buffered; },
    next() { const result = buffered ?? iterator.next(); buffered = null; return result; }
  };
}
function* words() { yield 'red'; yield 'green'; }
const input = peekable(words());
const {value:first} = input.peek();
console.log(JSON.stringify([first,input.peek().value,input.next().value,input.next().value,input.next().done]));
