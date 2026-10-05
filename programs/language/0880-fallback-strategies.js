function resolve(...strategies) {
  const rejected = [];
  for (const strategy of strategies) {
    try {
      const value = strategy();
      if (value != null) return {value,rejected};
      rejected.push('empty');
    } catch(error) { rejected.push(error.message); }
  }
  return {value:null,rejected};
}
console.log(JSON.stringify(resolve(() => null,() => {throw new Error('offline');},() => 'cached')));
