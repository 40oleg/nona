class MemoryLogger {
  constructor() { this.lines = []; }
  write(line) { this.lines.push(line); }
}
class NullLogger { write() {} }
class Processor {
  constructor(logger = new NullLogger()) { this.logger = logger; }
  run(values) { this.logger.write("start"); const sum = values.reduce((a, b) => a + b, 0); this.logger.write("total:" + sum); return sum; }
}
const logger = new MemoryLogger();
console.log(JSON.stringify([new Processor(logger).run([2, 3]), logger.lines, new Processor().run([4, 6])]));
