async function main() {
  async function* chunks() {
    for (const chunk of ['al', 'pha\nb', 'eta\ngamma']) yield await Promise.resolve(chunk);
  }
  let carry = '';
  const lines = [];
  for await (const chunk of chunks()) {
    const pieces = (carry + chunk).split('\n');
    carry = pieces.pop();
    lines.push(...pieces);
  }
  if (carry) lines.push(carry);
  console.log(JSON.stringify(lines));
}
main().catch(error => { throw error; });
