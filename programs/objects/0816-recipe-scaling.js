class Recipe {
  constructor(servings, ingredients) { this.servings = servings; this.ingredients = Object.freeze({ ...ingredients }); }
  scale(servings) { return new Recipe(servings, Object.fromEntries(Object.entries(this.ingredients).map(([name, amount]) => [name, amount * servings / this.servings]))); }
  toJSON() { return { servings: this.servings, ingredients: this.ingredients }; }
}
const recipe = new Recipe(2, { flour: 100, milk: 150 });
const party = recipe.scale(6);
console.log(JSON.stringify({
  original: recipe,
  party,
  immutable: Object.isFrozen(party.ingredients)
}));
