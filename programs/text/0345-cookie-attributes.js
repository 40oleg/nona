const header = 'session=abc=123; Path=/app; Secure; SameSite=Lax';
const parts = header.split(';');
const first = parts.shift().trim();
const at = first.indexOf('=');
const cookie = { name: first.slice(0, at), value: first.slice(at + 1), attributes: {} };
for (const part of parts) {
  const token = part.trim();
  const equal = token.indexOf('=');
  const name = (equal < 0 ? token : token.slice(0, equal)).toLowerCase();
  cookie.attributes[name] = equal < 0 ? true : token.slice(equal + 1);
}
console.log(JSON.stringify(cookie));
