function* count(label, end) {
  let sum = 0;
  for (let i = 1; i <= end; i++) { sum += i; yield label + ':' + sum; }
  return label + ':done';
}
const queue = [count('a',2),count('b',3)], log = [];
while (queue.length) {
  const job = queue.shift();
  const {value,done} = job.next();
  log.push(value);
  if (!done) queue.push(job);
}
console.log(JSON.stringify(log));
