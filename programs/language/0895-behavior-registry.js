function registry() {
  const handlers = {};
  return {
    add(name,fn) { handlers[name] = fn; return () => delete handlers[name]; },
    run(name,value) { const handler = handlers[name]; if (!handler) throw new Error('unknown:'+name); return handler(value); }
  };
}
const commands = registry();
const remove = commands.add('double',n => n*2);
console.log(commands.run('double',6)); remove();
try { commands.run('double',6); } catch(error) { console.log(error.message); }
