const values = [1, , 3];
const result = [0, ...values, 4, ,];
console.log(result.length, result.join(':'), 5 in result);
