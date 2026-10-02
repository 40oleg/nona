// The lexer evaluates the RegExp engine's source (an expression) to validate
// RegExp literals; an indirect eval runs it in the global scope.
export function runInNewContext(source) {
  return (0, eval)(source);
}
export default {runInNewContext};
