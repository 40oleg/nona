const descending = [1, -6, 11, -6], root = 2;
const quotient = [descending[0]];
for (let i = 1; i < descending.length - 1; i++) quotient.push(descending[i] + root * quotient[i - 1]);
const remainder = descending[descending.length - 1] + root * quotient[quotient.length - 1];
const at = (coefficients, x) => coefficients.reduce((total, c) => total * x + c, 0);
if (at(descending, 5) !== (5 - root) * at(quotient, 5) + remainder) throw new Error('division identity');
console.log(quotient.join(',') + ';r=' + remainder);
