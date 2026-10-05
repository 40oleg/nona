const cells = [];
for (let row = 0; row < 3; row++) {
  for (let col = 0; col < 2; col++) {
    const position = [row,col];
    cells.push(() => {
      const [r,c] = position;
      return {label:r+':'+c,value:r*10+c};
    });
  }
}
console.log(JSON.stringify(cells.map(read => read())));
