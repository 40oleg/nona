const body = '--cut\r\nName: alpha\r\n\r\none\r\n--cut\r\nName: beta\r\n\r\ntwo\r\n--cut--';
const records = [];
for (const segment of body.split('--cut')) {
  if (!segment.startsWith('\r\n')) continue;
  const trimmed = segment.slice(2, -2);
  const at = trimmed.indexOf('\r\n\r\n');
  const headers = {};
  for (const line of trimmed.slice(0, at).split('\r\n')) { const colon = line.indexOf(':'); headers[line.slice(0, colon)] = line.slice(colon + 1).trim(); }
  records.push({ headers, body: trimmed.slice(at + 4) });
}
console.log(JSON.stringify(records));
