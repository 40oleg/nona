function logger() {
  let prefix = ''; const log = [];
  const write = (...words) => log.push(prefix+words.join(' '));
  function context(label,fn) {
    const previous = prefix; prefix += label+'/';
    try { fn(write); } finally { prefix = previous; }
  }
  return {write,context,log};
}
const loggerInstance = logger();
loggerInstance.context('build',write => { write('start'); loggerInstance.context('test',inner => inner('pass')); write('end'); });
loggerInstance.write('idle');
console.log(JSON.stringify(loggerInstance.log));
