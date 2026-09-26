function make(x) {
  return y => arguments[0] + y + this.base;
}

var sum = make.call({base: 3}, 4);
console.log(sum(5));

function Box() {
  this.check = () => new.target === Box;
}
console.log(new Box().check());

var parent = {value: 7};
var child = {__proto__: parent, value: 2, read() { return () => super.value + this.value; }};
console.log(child.read()());
