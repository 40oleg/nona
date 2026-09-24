console.log("Степень:", 2 ** 10);

let player = {
  name: "Nona",
  score: 3,
  describe() {
    return this.name + " набрала " + this.score + " очков";
  }
};

player.score **= 2;
console.log("После **=:", player.score);
console.log("Метод:", player.describe?.());

let missingPlayer = null;
console.log("Безопасное свойство:", missingPlayer?.score);
console.log("Безопасный вызов:", missingPlayer?.describe());

console.log("Удаление существующего поля:", delete player?.score);
console.log("После удаления:", player?.score);
