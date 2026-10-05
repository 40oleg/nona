function managed(work,release) {
  const outcome = {};
  try { outcome.value = work(); }
  catch(error) { outcome.taskError = error.message; }
  finally {
    try { release(); }
    catch(error) { outcome.cleanupError = error.message; }
  }
  return outcome;
}
console.log(JSON.stringify(managed(() => {throw new Error('task');},() => {throw new Error('release');})));
console.log(JSON.stringify(managed(() => 7,() => {})));
