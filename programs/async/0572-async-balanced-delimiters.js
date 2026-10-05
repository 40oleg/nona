async function main() {
  async function* fragments() {
    for (const fragment of ['{[', '()]', '}']) yield await Promise.resolve(fragment);
  }
  const pairs = new Map([[')', '('], [']', '['], ['}', '{']]);
  const stack = [];
  let valid = true;
  for await (const fragment of fragments()) {
    for (const char of fragment) {
      if ('([{'.includes(char)) stack.push(char);
      else if (stack.pop() !== pairs.get(char)) valid = false;
    }
  }
  console.log(valid && stack.length === 0);
}
main().catch(error => { throw error; });
