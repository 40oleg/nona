export function escape(text) { return encodeURIComponent(text); }
export function unescape(text) { try { return decodeURIComponent(text); } catch { return text; } }
function stringifyPrimitive(value) {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && isFinite(value)) return '' + value;
  if (typeof value === 'bigint' || typeof value === 'boolean') return '' + value;
  return '';
}
export function stringify(object, sep = '&', eq = '=', options) {
  const encode = options && typeof options.encodeURIComponent === 'function' ? options.encodeURIComponent : escape;
  if (object === null || typeof object !== 'object') return '';
  const parts = [];
  for (const k of Object.keys(object)) {
    const value = object[k], key = encode(stringifyPrimitive(k)) + eq;
    if (Array.isArray(value)) for (const item of value) parts.push(key + encode(stringifyPrimitive(item)));
    else parts.push(key + encode(stringifyPrimitive(value)));
  }
  return parts.join(sep);
}
export function parse(text, sep = '&', eq = '=', options) {
  const decode = options && typeof options.decodeURIComponent === 'function' ? options.decodeURIComponent : unescape;
  const max = options && typeof options.maxKeys === 'number' ? options.maxKeys : 1000;
  const result = Object.create(null);
  if (typeof text !== 'string' || text.length === 0) return result;
  let pairs = text.split(sep);
  if (max > 0) pairs = pairs.slice(0, max);
  for (const pair of pairs) {
    if (!pair) continue;
    const at = pair.indexOf(eq);
    const k = decode((at >= 0 ? pair.slice(0, at) : pair).replace(/\+/g, ' '));
    const v = at >= 0 ? decode(pair.slice(at + eq.length).replace(/\+/g, ' ')) : '';
    if (!(k in result)) result[k] = v;
    else if (Array.isArray(result[k])) result[k].push(v);
    else result[k] = [result[k], v];
  }
  return result;
}
export const encode = stringify, decode = parse;
export default {escape, unescape, stringify, parse, encode, decode};
