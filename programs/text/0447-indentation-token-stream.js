const lines = ['root', '  alpha', '    leaf', '  beta', 'end'];
const levels = [0], tokens = [];
for (const line of lines) {
  const width = line.length - line.trimStart().length;
  if (width > levels[levels.length - 1]) { levels.push(width); tokens.push('INDENT'); }
  while (width < levels[levels.length - 1]) { levels.pop(); tokens.push('DEDENT'); }
  if (width !== levels[levels.length - 1]) throw new Error('bad indentation');
  tokens.push(line.trim());
}
while (levels.length > 1) { levels.pop(); tokens.push('DEDENT'); }
console.log(JSON.stringify(tokens));
