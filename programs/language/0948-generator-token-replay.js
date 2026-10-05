function* tokens(values) { yield* values; }
function replayable(source) {
  let previous, replay = false;
  return {
    next() { if (replay) { replay = false; return previous; } previous = source.next(); return previous; },
    rewind() { replay = true; }
  };
}
const reader = replayable(tokens(['let','x','=','4']));
const {value:first} = reader.next(); reader.rewind();
console.log(JSON.stringify([first,reader.next().value,reader.next().value,reader.next().value]));
