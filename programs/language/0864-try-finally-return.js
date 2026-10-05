const log = [];
function locate(rows, predicate) {
  try {
    for (const [index,row] of rows.entries()) {
      if (predicate(row)) return {index,row};
    }
    return null;
  } finally { log.push('search closed'); }
}
const found = locate([{score:2},{score:7},{score:9}],({score}) => score > 5);
console.log(JSON.stringify({found,log}));
