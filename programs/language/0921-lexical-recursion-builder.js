function scorer(weights) {
  function score({kind,children = []}) {
    return (weights[kind] ?? 0)+children.reduce((sum,child) => sum+score(child),0);
  }
  return score;
}
const tree = {kind:'branch',children:[{kind:'leaf'},{kind:'branch',children:[{kind:'leaf'}]}]};
const weighted = scorer({branch:3,leaf:1});
const count = scorer({branch:1,leaf:1});
console.log(weighted(tree));
console.log(count(tree));
