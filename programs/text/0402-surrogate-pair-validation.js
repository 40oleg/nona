const text = 'A\ud83d\ude00\ud800B\udc00';
const records = [];
for (let i = 0; i < text.length; i++) {
  const unit = text.charCodeAt(i);
  const next = text.charCodeAt(i + 1);
  if (unit >= 55296 && unit <= 56319 && next >= 56320 && next <= 57343) {
    records.push(['pair', i, 65536 + ((unit - 55296) << 10) + next - 56320]); i++;
  } else records.push([unit >= 55296 && unit <= 57343 ? 'isolated' : 'single', i, unit]);
}
console.log(JSON.stringify(records));
