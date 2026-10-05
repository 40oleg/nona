function suite(...checks) {
  const failures = []; let passed = 0;
  const assert = (condition,label) => { if (!condition) throw new Error(label); };
  for (const check of checks) {
    try { check(assert); passed++; }
    catch (error) { failures.push(error.message); }
  }
  return {passed,failures};
}
console.log(JSON.stringify(suite(
  assert => assert(2+2 === 4,'sum'),
  assert => assert('cat'.length === 4,'length'),
  assert => assert([1,2].includes(2),'membership'))));
