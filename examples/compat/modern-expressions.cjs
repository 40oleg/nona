console.log(2 ** 3 ** 2, 2 ** -2, (-2) ** 3);
let box = { value: 3, read() { return this.value; } };
console.log(box?.value, box?.read(), box.read?.());
let absent = null;
let effects = 0;
console.log(absent?.[++effects], absent?.read(++effects), effects);
console.log(delete absent?.value, delete box?.value, "value" in box);
try { console.log((absent?.value).x); } catch (error) { console.log(error.name); }
let target = { x: 2 };
target.x **= 3;
console.log(target.x);
