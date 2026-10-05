function compare(...selectors) {
  return (a,b) => {
    for (const selector of selectors) {
      const x = selector(a), y = selector(b);
      if (x !== y) return x < y ? -1 : 1;
    }
    return 0;
  };
}
const rows = [{team:'b',rank:1},{team:'a',rank:2},{team:'a',rank:1}];
rows.sort(compare(({team}) => team,({rank}) => rank));
console.log(JSON.stringify(rows));
