const log = [];
function scope(work) {
  const releases = [];
  const acquire = name => { log.push('open:'+name); releases.push(() => log.push('close:'+name)); return name; };
  try { return work(acquire); }
  finally { while (releases.length) releases.pop()(); }
}
try {
  scope(open => { const a = open('cache'); const b = open('index'); throw new Error(a+'+'+b); });
} catch (error) { log.push('error:'+error.message); }
console.log(JSON.stringify(log));
