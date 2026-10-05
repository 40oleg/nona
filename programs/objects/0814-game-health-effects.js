class Character {
  #health;
  constructor(maxHealth) { this.maxHealth = maxHealth; this.#health = maxHealth; this.shield = 0; }
  damage(amount) { const blocked = Math.min(this.shield, amount); this.shield -= blocked; this.#health = Math.max(0, this.#health - amount + blocked); }
  heal(amount) { this.#health = Math.min(this.maxHealth, this.#health + amount); }
  get alive() { return this.#health > 0; }
  toJSON() { return { health: this.#health, shield: this.shield, alive: this.alive }; }
}
const hero = new Character(20); hero.shield = 5; hero.damage(12); hero.heal(3);
console.log(JSON.stringify(hero));
