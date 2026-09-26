const values = [1, , 2, 1];
console.log(values.indexOf(1), values.lastIndexOf(1));
console.log(values.indexOf(undefined), values.lastIndexOf(undefined));
console.log(values.lastIndexOf(1, -Infinity));
