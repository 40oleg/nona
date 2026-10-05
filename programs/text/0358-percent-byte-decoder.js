const input = 'red%20blue%2Fgreen%ZZ';
const bytes = [];
let literal = '';
for (let i = 0; i < input.length; i++) {
  const pair = input.slice(i + 1, i + 3);
  if (input[i] === '%' && /^[0-9a-f]{2}$/i.test(pair)) {
    const code = parseInt(pair, 16); bytes.push(code); literal += String.fromCharCode(code); i += 2;
  } else literal += input[i];
}
console.log(JSON.stringify({ literal, bytes }));
