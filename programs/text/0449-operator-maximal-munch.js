const operators = ['=', '==', '===', '!', '!=', '!==', '+', '++', '+='].sort((a, b) => b.length - a.length);
const source = 'a++!==b+=c';
const tokens = [];
for (let i = 0; i < source.length;) {
  const operator = operators.find(token => source.startsWith(token, i));
  if (operator) { tokens.push(['op', operator]); i += operator.length; }
  else {
    let word = '';
    while (i < source.length && !operators.some(token => source.startsWith(token, i))) word += source[i++];
    tokens.push(['word', word]);
  }
}
console.log(JSON.stringify(tokens));
