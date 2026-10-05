class Pipeline {
  constructor(stages = []) { this.stages = stages; }
  through(name, process) { return new Pipeline([...this.stages, { name, process }]); }
  run(input) {
    let value = input; const trace = [];
    for (const stage of this.stages) { value = stage.process(value); trace.push([stage.name, value]); }
    return trace;
  }
}
const base = new Pipeline().through("trim", text => text.trim());
const pipeline = base.through("words", text => text.split(/\s+/)).through("count", words => words.length);
console.log(JSON.stringify([base.run(" a b "), pipeline.run(" a b ")]));
