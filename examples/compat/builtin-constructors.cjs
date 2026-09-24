let plain = {x: 7};
console.log(Object(plain) === plain, new Object(plain) === plain);
console.log(Object(3).valueOf(), Object("ab").length);
console.log(Boolean(""), Boolean({}), Number("0x20"), String(null));

let n = new Number("12"), s = new String("abc"), b = new Boolean(false);
console.log(n + 1, s[1], s.length, b.valueOf(), Boolean(b));
console.log(n instanceof Number, s instanceof String, b instanceof Boolean);

let holes = Array(3), values = new Array(1, 2, 3);
console.log(holes.length, 0 in holes, holes.join("|"), values.join("/"));
let Bound = Array.bind(null, 4).bind(null, 5);
console.log(new Bound(6).join("/"));

let trace = "";
let value = {
  valueOf: function () { trace += "v"; return 17; },
  toString: function () { trace += "s"; return "text"; }
};
console.log(new Number(value).valueOf(), new String(value).valueOf(), trace);
console.log(Object.prototype.constructor === Object, Number.constructor === Function);
console.log(Object.name, Array.length, Number.toString());
