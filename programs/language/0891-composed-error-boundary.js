const compose = (...steps) => value => steps.reduceRight((v,fn) => fn(v),value);
const boundary = (fn,fallback) => value => {
  try { return fn(value); }
  catch(error) { return fallback(error,value); }
};
const positive = value => { if (value <= 0) throw new Error('positive'); return value; };
const calculate = compose(value => 100/value,positive,value => Number(value));
const safe = boundary(calculate,(error,value) => error.message+':'+value);
console.log(JSON.stringify(['5','0','-2'].map(safe)));
console.log(calculate('4'));
