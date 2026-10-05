function process(...stages) {
  return input => {
    let result = {value:input};
    for (const stage of stages) {
      result = stage(result.value);
      if (result.error) break;
    }
    return result;
  };
}
const run = process(value => ({value:value.trim()}),value => value ? {value} : {error:'empty'},value => ({value:value.toUpperCase()}));
console.log(JSON.stringify([' hi ',' '].map(run)));
