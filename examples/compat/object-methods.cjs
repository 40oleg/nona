let tag = {}.toString, value = {}.valueOf;
console.log(tag.call(null), tag.call(undefined), tag.call(3), tag.call("ab"));
function f() { return tag.call(arguments); }
console.log(tag.call(f), tag.call([]), tag.call({}), f());
let number = value.call(7), text = value.call("ab");
console.log(typeof number, number + 2, text.length, text[1]);
let a = [1, null, undefined, , 5];
console.log(a.join("/"), a.join(), a.toString());
let join = [].join;
console.log(join.call({0: "a", 1: "b", length: 2}, "--"), join.call("abc", ":"));
let self = [1, 2];
console.log(self.join(self));
self[2] = self;
console.log(self.join("/"));
let o = {text: "callback", join: function() { return this.text; }};
console.log([].toString.call(o));
o.join = 3;
console.log([].toString.call(o));
console.log(join.name, join.length, join.toString());
