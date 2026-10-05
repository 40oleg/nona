async function main() {
  const closed = [];
  async function* inner() {
    try { yield 'a'; yield await Promise.resolve('b'); yield 'c'; }
    finally { closed.push('inner'); }
  }
  async function* outer() {
    try { for await (const value of inner()) yield value.toUpperCase(); }
    finally { closed.push('outer'); }
  }
  const consumed = [];
  for await (const value of outer()) { consumed.push(value); if (value === 'B') break; }
  console.log(JSON.stringify([consumed, closed]));
}
main().catch(error => { throw error; });
