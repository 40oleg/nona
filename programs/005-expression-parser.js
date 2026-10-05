// Recursive descent evaluates precedence, parentheses and unary minus without eval.
function evaluate(source) {
  let index = 0;
  function factor() {
    if (source[index] === '-') { index++; return -factor(); }
    if (source[index] === '(') {
      index++;
      const value = expression();
      if (source[index++] !== ')') throw new Error('Expected closing parenthesis');
      return value;
    }
    const start = index;
    while (index < source.length && source[index] >= '0' && source[index] <= '9') index++;
    if (start === index) throw new Error('Expected number');
    return Number(source.slice(start, index));
  }
  function term() {
    let value = factor();
    while (source[index] === '*' || source[index] === '/') {
      const operator = source[index++];
      const right = factor();
      value = operator === '*' ? value * right : value / right;
    }
    return value;
  }
  function expression() {
    let value = term();
    while (source[index] === '+' || source[index] === '-') {
      const operator = source[index++];
      const right = term();
      value = operator === '+' ? value + right : value - right;
    }
    return value;
  }
  const result = expression();
  if (index !== source.length) throw new Error('Unexpected input');
  return result;
}

console.log(evaluate('2+3*(7-4)'));
console.log(evaluate('18/3-2'));
console.log(evaluate('-(4+5)*2'));
