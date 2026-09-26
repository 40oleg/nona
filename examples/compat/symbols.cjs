var a=Symbol('a');
var b=Symbol.for('shared');
var object={name:'nona'};
object[a]=3;
object[b]=5;
console.log(typeof a,a.description,Symbol.keyFor(b));
console.log(Object.keys(object).join(','),Object.getOwnPropertySymbols(object).length,object[a]+object[b]);
console.log(Object.prototype.toString.call({[Symbol.toStringTag]:'Nona'}));
