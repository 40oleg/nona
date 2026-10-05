function patch(target, changes) {
  if (changes === null || typeof changes !== 'object' || Array.isArray(changes)) return changes;
  const result = target && typeof target === 'object' && !Array.isArray(target) ? { ...target } : {};
  for (const key of Object.keys(changes)) {
    if (changes[key] === null) delete result[key];
    else result[key] = patch(result[key], changes[key]);
  }
  return result;
}
const target = { user: { name: 'Ada', age: 30 }, tags: ['old'], remove: 1 };
const changes = { user: { age: 31 }, tags: ['new'], remove: null };
console.log(JSON.stringify(patch(target, changes)));
