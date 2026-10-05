class Workshop {
  constructor(materials) { this.materials = new Map(Object.entries(materials)); }
  craft(recipe) {
    if (!Object.entries(recipe.needs).every(([name, quantity]) => (this.materials.get(name) ?? 0) >= quantity)) return false;
    for (const [name, quantity] of Object.entries(recipe.needs)) this.materials.set(name, this.materials.get(name) - quantity);
    this.materials.set(recipe.product, (this.materials.get(recipe.product) ?? 0) + 1); return true;
  }
  toJSON() { return Object.fromEntries(this.materials); }
}
const workshop = new Workshop({ wood: 5, iron: 2 }), recipe = { product: "axe", needs: { wood: 2, iron: 1 } };
console.log(JSON.stringify([workshop.craft(recipe), workshop.craft(recipe), workshop.craft(recipe), workshop]));
