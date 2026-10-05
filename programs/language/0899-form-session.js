function session(initial) {
  let state = {...initial}; const errors = [];
  return {
    edit(key,value) {
      try { if (key === 'age' && value < 0) throw new Error('negative age'); state = {...state,[key]:value}; }
      catch(error) { errors.push(error.message); }
    }, snapshot() { return {...state,errors:[...errors]}; }
  };
}
const form = session({name:'A',age:4});
form.edit('age',-1); form.edit('name','Ada');
console.log(JSON.stringify(form.snapshot()));
