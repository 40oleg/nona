let types = [Error, EvalError, RangeError, ReferenceError, SyntaxError, TypeError, URIError];
for (let i = 0; i < types.length; i++) {
  let C = types[i], error = new C('message ' + i);
  console.log(C.name, String(error), error instanceof Error);
  let descriptor = Object.getOwnPropertyDescriptor(error, 'message');
  console.log(descriptor.writable, descriptor.enumerable, descriptor.configurable);
}
let checks = [
  function () { let f = 3; f(); },
  function () { let array = []; array.length = -1; },
  function () { console.log(value); let value = 1; },
  function () { const value = 1; value = 2; },
  function () { Object.defineProperty({}, 'x', {get: 3}); }
];
for (let i = 0; i < checks.length; i++) {
  try { checks[i](); }
  catch (error) { console.log(error.name, error instanceof Error); }
  finally { console.log('continued', i); }
}
let array = [{toString() { return {}; }, valueOf() { return {}; }}];
try { array.join(); } catch (error) { console.log(error.name); }
array[0] = 'recovered';
console.log(array.join());
