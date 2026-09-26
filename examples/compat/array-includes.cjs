var values = [1, , NaN];
console.log(values.includes(1), values.includes(undefined), values.includes(NaN));
console.log(values.includes(1, 1), values.includes(NaN, -1));
