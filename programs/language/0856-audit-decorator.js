const audit = [];
function traced(name, fn) {
  return function(...args) {
    audit.push('start:'+name);
    try { return fn.apply(this,args); }
    finally { audit.push('end:'+name); }
  };
}
const service = {rate:4,quote:traced('quote',function(quantity){return this.rate*quantity;})};
console.log(service.quote(3));
console.log(JSON.stringify(audit));
