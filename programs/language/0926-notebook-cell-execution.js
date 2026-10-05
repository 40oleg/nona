function notebook() {
  const bindings = {}, results = [];
  return {
    run(label,cell) {
      try { const value = cell(bindings); results.push({label,value}); }
      catch(error) { results.push({label,error:error.message}); }
    }, report() { return {bindings,results}; }
  };
}
const book = notebook();
book.run('define',env => env.x = 4);
book.run('double',({x}) => x*2);
book.run('fail',env => { if (!env.y) throw new Error('missing y'); });
console.log(JSON.stringify(book.report()));
