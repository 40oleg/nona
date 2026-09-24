function Target(value) {
  console.log(new.target === Target, typeof new.target);
  this.value = value;
}
Target.call({}, 1);
let Bound = Target.bind(null, 7);
let Twice = Bound.bind({});
let instance = new Twice();
console.log(instance.value, instance instanceof Target);
function Inner() {console.log(new.target === Inner);}
function Outer() {
  new Inner();
  let object = {method() {return new.target;}};
  console.log(object.method(), new.target === Outer);
}
new Outer();
function Returning() {return new.target;}
console.log(new Returning() === Returning, Returning());
