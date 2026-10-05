function* records() {
  yield {name:'header',value:1}; yield {name:'start',value:2}; yield {name:'item',value:3}; yield {name:'item',value:4};
}
function* after(source,predicate) {
  let found = false;
  for (const row of source) {
    if (found) yield row;
    else if (predicate(row)) found = true;
  }
}
console.log(JSON.stringify([...after(records(),({name}) => name === 'start')].map(({value}) => value)));
