let record = {a:2,b:3};
function edit(work) {
  const staged = {...record};
  const write = (key,value) => { staged[key] = value; };
  try {
    work(write);
    if (Object.values(staged).some(value => value < 0)) throw new Error('negative');
    record = staged; return 'committed';
  } catch(error) { return error.message; }
}
console.log(edit(write => {write('a',5); write('b',-1);}));
console.log(edit(write => write('b',7)));
console.log(JSON.stringify(record));
