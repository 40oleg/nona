const alphabet = 'Alfa Bravo Charlie Delta Echo Foxtrot Golf Hotel India Juliett Kilo Lima Mike November Oscar Papa Quebec Romeo Sierra Tango Uniform Victor Whiskey Xray Yankee Zulu'.split(' ');
const digits = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
const text = 'AB 12 Z';
const words = [];
for (const c of text) {
  if (c === ' ') words.push('/');
  else if (c >= '0' && c <= '9') words.push(digits[Number(c)]);
  else words.push(alphabet[c.charCodeAt(0) - 65]);
}
console.log(words.join(' '));
