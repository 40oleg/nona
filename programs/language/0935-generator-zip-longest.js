function* zip(left,right,fill = '-') {
  const a = left[Symbol.iterator](), b = right[Symbol.iterator]();
  while (true) {
    const {value:x,done:doneA} = a.next();
    const {value:y,done:doneB} = b.next();
    if (doneA && doneB) return;
    yield [doneA ? fill : x,doneB ? fill : y];
  }
}
console.log(JSON.stringify([...zip([1,2,3],['a'])]));
console.log(JSON.stringify([...zip([],['x'],null)]));
