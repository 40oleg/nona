function normalize(path) {
  const stack = [];
  for (const segment of path.split('/')) {
    if (!segment || segment === '.') continue;
    if (segment === '..') { if (stack.length) stack.pop(); }
    else stack.push(segment);
  }
  return '/' + stack.join('/');
}
const paths = ['/a/./b/../c', '/../../x', '/one//two/'];
console.log(JSON.stringify(paths.map(normalize)));
