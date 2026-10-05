const document = { 'a/b': { '~key': [11, 22, 33] }, plain: true };
function resolve(pointer) {
  if (pointer === '') return document;
  let current = document;
  for (const segment of pointer.slice(1).split('/')) {
    const key = segment.replace(/~1/g, '/').replace(/~0/g, '~');
    if (current === null || typeof current !== 'object' || !(key in current)) return 'missing';
    current = current[key];
  }
  return current;
}
console.log(JSON.stringify(['/a~1b/~0key/1', '/plain', '/none'].map(resolve)));
