import {resolve as resolvePath} from 'node:path';
export const URL = globalThis.URL;
export const URLSearchParams = globalThis.URLSearchParams;
const windows = process.platform === 'win32';
function invalid(message, code) { const error = new TypeError(message); error.code = code; return error; }
export function fileURLToPath(url) {
  const parsed = typeof url === 'string' ? new URL(url) : url;
  if (!parsed || typeof parsed.href !== 'string') throw invalid('The "path" argument must be of type string or an instance of URL', 'ERR_INVALID_ARG_TYPE');
  if (parsed.protocol !== 'file:') throw invalid('The URL must be of scheme file', 'ERR_INVALID_URL_SCHEME');
  let pathname = parsed.pathname;
  for (let i = 0; i < pathname.length; i++) if (pathname[i] === '%' && (pathname[i + 1] === '2' && (pathname[i + 2] === 'f' || pathname[i + 2] === 'F') || windows && pathname[i + 1] === '5' && (pathname[i + 2] === 'c' || pathname[i + 2] === 'C')))
    throw invalid('File URL path must not include encoded ' + (windows ? '\\ or / characters' : '/ characters'), 'ERR_INVALID_FILE_URL_PATH');
  pathname = decodeURIComponent(pathname);
  if (!windows) {
    if (parsed.hostname !== '') throw invalid('File URL host must be "localhost" or empty on ' + process.platform, 'ERR_INVALID_FILE_URL_HOST');
    return pathname;
  }
  pathname = pathname.split('/').join('\\');
  if (parsed.hostname !== '') return '\\\\' + parsed.hostname + pathname;
  const letter = pathname.charCodeAt(1) | 0x20;
  if (!(letter >= 97 && letter <= 122) || pathname[2] !== ':') throw invalid('File URL path must be absolute', 'ERR_INVALID_FILE_URL_PATH');
  return pathname.slice(1);
}
export function pathToFileURL(path) {
  // As in Node.js: an absolute path (path.resolve), keeping a trailing separator.
  const text = String(path), trailing = text.endsWith('/') || windows && text.endsWith('\\');
  let resolved = resolvePath(text);
  if (windows) {
    resolved = resolved.split('\\').join('/');
    // A UNC path \\host\share\x becomes file://host/share/x.
    if (resolved.startsWith('//')) {
      const slash = resolved.indexOf('/', 2);
      const host = slash < 0 ? resolved.slice(2) : resolved.slice(2, slash);
      return new URL('file://' + host + encodePath(slash < 0 ? '/' : resolved.slice(slash)));
    }
  }
  if (trailing && !resolved.endsWith('/')) resolved += '/';
  return new URL('file://' + (resolved.startsWith('/') ? '' : '/') + encodePath(resolved));
}
function encodePath(resolved) {
  // The characters Node.js percent-encodes in a file URL path, besides controls and non-ASCII.
  let encoded = '';
  for (const ch of resolved) {
    const code = ch.codePointAt(0);
    if (code > 0x20 && code < 0x7f && !'"#%<>?[\\]^\x60{|}~'.includes(ch)) { encoded += ch; continue; }
    for (const byte of new TextEncoder().encode(ch)) encoded += '%' + (byte < 16 ? '0' : '') + byte.toString(16).toUpperCase();
  }
  return encoded;
}
export function domainToASCII(domain) { return String(domain).toLowerCase(); }
export function domainToUnicode(domain) { return String(domain); }
export function urlToHttpOptions(url) {
  return {protocol: url.protocol, hostname: url.hostname, hash: url.hash, search: url.search, pathname: url.pathname, path: url.pathname + url.search, href: url.href, ...(url.port !== '' ? {port: Number(url.port)} : {})};
}
export function parse(text, parseQuery) {
  let url;
  try { url = new URL(text); } catch { return {protocol: null, slashes: null, auth: null, host: null, port: null, hostname: null, hash: null, search: null, query: parseQuery ? {} : null, pathname: text, path: text, href: text}; }
  const query = url.search ? url.search.slice(1) : null;
  return {protocol: url.protocol, slashes: true, auth: url.username ? url.username + (url.password ? ':' + url.password : '') : null, host: url.host, port: url.port || null, hostname: url.hostname,
    hash: url.hash || null, search: url.search || null, query: parseQuery ? Object.fromEntries((query || '').split('&').filter(Boolean).map(pair => pair.split('=').map(decodeURIComponent))) : query,
    pathname: url.pathname, path: url.pathname + url.search, href: url.href};
}
export function format(value) {
  if (typeof value === 'string') return value;
  if (value instanceof URL) return value.href;
  const protocol = value.protocol ? (value.protocol.endsWith(':') ? value.protocol : value.protocol + ':') : '';
  const host = value.host || ((value.hostname || '') + (value.port ? ':' + value.port : ''));
  const search = value.search || (value.query && typeof value.query === 'object' ? '?' + Object.entries(value.query).map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v)).join('&') : '');
  return protocol + (host || protocol === 'file:' ? '//' : '') + host + (value.pathname || '') + search + (value.hash || '');
}
export function resolve(from, to) { return new URL(to, new URL(from, 'resolve://')).href.replace(/^resolve:\/\/\/?/, ''); }
export default {URL, URLSearchParams, fileURLToPath, pathToFileURL, domainToASCII, domainToUnicode, urlToHttpOptions, parse, format, resolve};
