const aliases = {daily:['scan','report'],release:['daily','publish'],loop:['loop']};
function expand(command, path = []) {
  if (path.includes(command)) throw new Error('recursive:'+command);
  if (!aliases[command]) return [command];
  const output = [];
  for (const item of aliases[command]) output.push(...expand(item,[...path,command]));
  return output;
}
console.log(JSON.stringify(expand('release')));
try { expand('loop'); }
catch (error) { console.log(error.message); }
