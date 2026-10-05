function retry(operation, limit = 3) {
  const errors = [];
  for (let attempt = 1; attempt <= limit; attempt++) {
    try { return {value:operation(attempt),errors}; }
    catch (error) { errors.push(error.message); }
  }
  return {value:null,errors};
}
let calls = 0;
const result = retry(attempt => { calls++; if (attempt < 3) throw new Error('busy:'+attempt); return 'ready'; });
console.log(JSON.stringify({...result,calls}));
