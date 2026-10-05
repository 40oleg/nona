const choices = [[0, 1], [2, 3], [0, 2], [1], [3]], answers = [];
function cover(covered, picks) {
  if (covered.size === 4) { answers.push(picks); return; }
  let missing = 0; while (covered.has(missing)) missing++;
  choices.forEach((choice, i) => {
    if (!choice.includes(missing) || choice.some(v => covered.has(v))) return;
    cover(new Set([...covered, ...choice]), [...picks, i]);
  });
}
cover(new Set(), []);
console.log(JSON.stringify(answers));
