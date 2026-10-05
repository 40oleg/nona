function cascade(primary,backup) {
  try { return {value:primary(),source:'primary'}; }
  catch(first) {
    try { return {value:backup(),source:'backup',warning:first.message}; }
    catch(second) { return {errors:[first.message,second.message]}; }
  }
}
const fail = label => () => {throw new Error(label);};
const {value,source} = cascade(fail('offline'),() => 7);
console.log(value+':'+source);
console.log(JSON.stringify(cascade(fail('a'),fail('b'))));
