function document() {
  const root = []; let target = root;
  return {
    text(value) { target.push(value); },
    section(name,build) {
      const children = [], previous = target;
      target.push({name,children}); target = children;
      try { build(); } finally { target = previous; }
    }, result() { return [...root]; }
  };
}
const doc = document();
doc.section('intro',() => { doc.text('hello'); doc.section('detail',() => doc.text('world')); }); doc.text('end');
console.log(JSON.stringify(doc.result()));
