async function main() {
  const allergens = new Set(['nuts', 'milk']);
  const ingredients = new Map([['salad', ['lettuce', 'oil']], ['pasta', ['wheat', 'milk']], ['stew', ['beans', 'carrot']], ['cake', ['nuts', 'wheat']]]);
  const menu = [{ name: 'salad', price: 8 }, { name: 'pasta', price: 7 }, { name: 'stew', price: 6 }, { name: 'cake', price: 4 }];
  const evaluated = await Promise.all(menu.map(async meal => {
    const contents = await Promise.resolve(ingredients.get(meal.name));
    if (!contents) throw new Error('undeclared meal');
    return { ...meal, safe: !contents.some(ingredient => allergens.has(ingredient)) };
  }));
  const safe = evaluated.filter(meal => meal.safe).sort((a, b) => a.price - b.price);
  if (!safe.length) throw new Error('no safe meal');
  const rejected = evaluated.filter(meal => !meal.safe).map(meal => meal.name);
  console.log(JSON.stringify([safe[0].name, safe[0].price, rejected]));
}
main().catch(error => { throw error; });
