const wire = 'Hello=20world=21=\r\nNext=09line=3Dend=ZZ';
let decoded = '';
const softBreaks = [];
for (let i = 0; i < wire.length; i++) {
  if (wire[i] !== '=') { decoded += wire[i]; continue; }
  if (wire.slice(i + 1, i + 3) === '\r\n') {
    softBreaks.push(i);
    i += 2;
    continue;
  }
  const pair = wire.slice(i + 1, i + 3);
  if (/^[0-9A-F]{2}$/i.test(pair)) {
    decoded += String.fromCharCode(parseInt(pair, 16));
    i += 2;
  } else decoded += '=';
}
console.log(JSON.stringify({ decoded, softBreaks }));
