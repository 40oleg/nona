console.log(encodeURI('https://example.test/a b?x=é😀'));
console.log(encodeURIComponent('https://example.test/a b?x=é😀'));
for (var f of [encodeURI, encodeURIComponent]) {
  try { f('\uD800'); } catch (e) { console.log(e instanceof URIError); }
}
