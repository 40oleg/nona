import http from 'node:http';
const port = Number(process.argv[process.argv.length - 1]);
const big = 'x'.repeat(65536);
const user = { id: 42, name: 'Ada Lovelace', email: 'ada@example.com', roles: ['admin', 'dev'], active: true };
http.createServer((req, res) => {
  const url = req.url;
  if (url === '/') { res.setHeader('Content-Type', 'text/plain'); res.end('Hello, World!'); }
  else if (url === '/json') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(user)); }
  else if (url === '/big') { res.setHeader('Content-Type', 'text/plain'); res.end(big); }
  else if (url === '/upload') {
    let n = 0;
    req.on('data', c => { n += c.length; });
    req.on('end', () => { res.end('got ' + n); });
  } else { res.statusCode = 404; res.end(); }
}).listen(port, '127.0.0.1');
