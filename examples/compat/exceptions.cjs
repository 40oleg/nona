function invoke(callback) { return callback.call(null); }
try {
  invoke(function () { throw {message: 'caught', value: 17}; });
} catch (error) {
  console.log(error.message, error.value);
}
let saved;
let e = 'outer';
try { throw 'inner'; } catch (e) {
  var ignored = 3;
  saved = function () { return e; };
  e = 'captured';
}
console.log(e, saved(), ignored);
let attempts = 0;
let element = {toString() {
  attempts++;
  if (attempts === 1) throw 'conversion';
  return 'ok';
}};
let array = [element];
try { console.log(array.join()); } catch (error) { console.log(error); }
console.log(array.join(), attempts);
function choose() {
  try { return invoke(function () { throw 42; }); }
  catch (value) { return value + 1; }
}
console.log(choose());
let index = 0;
while (index < 3) {
  index++;
  try { if (index === 1) continue; if (index === 2) throw index; break; }
  catch (value) { console.log('loop', value); }
}
try { try { throw undefined; } catch { throw 'again'; } }
catch (value) { console.log(value, index); }
