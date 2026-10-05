const recipe = { servings: 2, ingredients: [{name:'rice',amount:120},{name:'water',amount:240}] };
const scaleRecipe = ({servings, ingredients, ...notes}, guests) => {
  const ratio = guests / servings;
  return { ...notes, servings: guests, ingredients: ingredients.map(({name,amount}) => ({name,amount:amount*ratio})) };
};
const expanded = scaleRecipe(recipe, 5);
let total = 0;
for (const {amount} of expanded.ingredients) total += amount;
console.log(expanded.ingredients[0]?.name ?? 'empty');
console.log(total);
console.log(JSON.stringify(expanded));
