const original = Object.freeze({name:"Ada",score:3});
const increments = [2,4,-1];
const history = [original];
for (const delta of increments) {
  const previous = history[history.length-1];
  history.push(Object.freeze({...previous,score:previous.score+delta}));
}
const scores = history.map(record=>record.score);
const frozen = history.every(record=>Object.isFrozen(record));
console.log(JSON.stringify({scores,frozen,original:original.score}));
