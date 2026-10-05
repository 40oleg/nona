const input = 'aaabccccddaaaa';
const packets = [];
let index = 0;
while (index < input.length) {
  let end = index + 1;
  while (end < input.length && input[end] === input[index]) end++;
  packets.push([end - index, input[index]]);
  index = end;
}
const decoded = packets.map(([count, character]) => character.repeat(count)).join('');
console.log(JSON.stringify({ packets, decoded, equal: decoded === input }));
