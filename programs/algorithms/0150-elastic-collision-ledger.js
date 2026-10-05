const balls = [{x: 0, velocity: 2}, {x: 4, velocity: -1}, {x: 10, velocity: -2}];
const energy = () => balls.reduce((sum, ball) => sum + ball.velocity ** 2, 0), before = energy();
const events = [];
for (let tick = 1; tick <= 4; tick++) {
  balls.forEach(ball => { ball.x += ball.velocity; });
  for (let i = 0; i + 1 < balls.length; i++) if (balls[i].x >= balls[i + 1].x && balls[i].velocity > balls[i + 1].velocity) { [balls[i].velocity, balls[i + 1].velocity] = [balls[i + 1].velocity, balls[i].velocity]; events.push(tick + ':' + i); }
}
if (energy() !== before) throw new Error('energy');
console.log(events.join(',') + ':' + balls.map(b => b.velocity).join(','));
