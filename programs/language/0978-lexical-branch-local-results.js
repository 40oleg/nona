function choose({kind,value}) {
  let result;
  if (kind === 'double') {
    const value2 = value*2;
    result = () => value2;
  } else {
    const value2 = value+1;
    result = () => value2;
  }
  return result;
}
console.log(JSON.stringify([{kind:'double',value:3},{kind:'increment',value:3}].map(row => choose(row)())));
