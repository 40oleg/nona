const header = '<https://example.test/p2>; rel="next", <https://example.test/p1>; rel="prev"; title="First"';
const links = [];
for (const entry of header.split(', ')) {
  const end = entry.indexOf('>');
  const link = { url: entry.slice(1, end), params: {} };
  for (const part of entry.slice(end + 1).split(';')) {
    const token = part.trim(); if (!token) continue;
    const at = token.indexOf('=');
    link.params[token.slice(0, at)] = token.slice(at + 1).replace(/^"|"$/g, '');
  }
  links.push(link);
}
console.log(JSON.stringify(links));
