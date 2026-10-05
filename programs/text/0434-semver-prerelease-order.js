function compare(a, b) {
  const [av, ap] = a.split('-'), [bv, bp] = b.split('-');
  const x = av.split('.').map(Number), y = bv.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  if (ap === undefined || bp === undefined) return ap === bp ? 0 : ap === undefined ? 1 : -1;
  const aa = ap.split('.'), bb = bp.split('.');
  for (let i = 0; i < Math.max(aa.length, bb.length); i++) {
    if (aa[i] === undefined || bb[i] === undefined) return aa[i] === undefined ? -1 : 1;
    if (aa[i] === bb[i]) continue;
    const an = /^\d+$/.test(aa[i]), bn = /^\d+$/.test(bb[i]);
    return an && bn ? Number(aa[i]) - Number(bb[i]) : an !== bn ? an ? -1 : 1 : aa[i] < bb[i] ? -1 : 1;
  }
  return 0;
}
console.log(JSON.stringify(['1.0.0', '1.0.0-beta.2', '1.0.0-alpha', '1.0.0-beta.11'].sort(compare)));
