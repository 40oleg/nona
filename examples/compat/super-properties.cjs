let parent = {
  x: 2,
  read() {return this.x;},
  set value(v) {this.x = v;},
  get value() {return this.x;}
};
let object = {
  __proto__: parent,
  x: 7,
  read() {return super.read() + super.x;},
  write(v) {super.value = v; return super.value;}
};
console.log(object.read(), object.read.call({x: 9}), object.write(11));
let borrowed = object.read;
object = null;
for (let i=0; i<30; i++) {({text: '' + i});}
console.log(borrowed.call({x: 8}));
let changing = {
  __proto__: {x: 1},
  read() {return super.x;},
  write() {super.x = (Object.setPrototypeOf(changing, {x: 4}), 7);}
};
console.log(changing.read());
changing.write();
console.log(changing.x, changing.read());
