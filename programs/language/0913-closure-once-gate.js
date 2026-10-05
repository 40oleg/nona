function once(fn) {
  let completed = false, value;
  return (...args) => {
    if (!completed) { value = fn(...args); completed = true; }
    return value;
  };
}
let runs = 0;
const initialize = once(label => { runs++; if (!label) throw new Error('label'); return label.toUpperCase(); });
try { initialize(''); } catch(error) { console.log(error.message); }
console.log(JSON.stringify([initialize('first'),initialize('second'),runs]));
