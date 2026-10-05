const execute = (words) => {
  const stack = [], variables = {};
  for (const [op, value] of words) {
    if (op === 'push') stack.push(value);
    else if (op === 'store') variables[value] = stack.pop();
    else if (op === 'load') stack.push(variables[value] ?? 0);
    else if (op === 'add') stack.push(stack.pop() + stack.pop());
    else throw new Error('unknown instruction');
  }
  return stack;
};
console.log(JSON.stringify(execute([['push',4],['store','x'],['load','x'],['push',7],['add']])));
