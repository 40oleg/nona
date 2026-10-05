const accept = 'text/*;q=0.5, application/json;q=0.9, */*;q=0.1';
const candidates = accept.split(',').map(part => { const [type, parameter] = part.trim().split(';q='); return { type, q: parameter === undefined ? 1 : Number(parameter), specificity: type === '*/*' ? 0 : type.endsWith('/*') ? 1 : 2 }; });
const supported = ['text/plain', 'application/json'];
const scored = supported.map(type => {
  const matches = candidates.filter(entry => entry.type === type || entry.type === '*/*' || entry.type === type.split('/')[0] + '/*');
  matches.sort((a, b) => b.specificity - a.specificity);
  return { type, q: matches.length ? matches[0].q : 0 };
});
scored.sort((a, b) => b.q - a.q);
console.log(JSON.stringify(scored));
