console.log(decodeURI('https://example.test/a%20b?x=%C3%A9%F0%9F%98%80'));
console.log(decodeURIComponent('a%20b%3F%3D%23'));
console.log(decodeURI('%3b%2F'), decodeURIComponent('%3b%2F'));
for (var s of ['%GG', '%C0%80', '%ED%A0%80']) {
  try { decodeURIComponent(s); } catch (e) { console.log(e instanceof URIError); }
}
