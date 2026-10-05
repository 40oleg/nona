function subscriber(multiplier = 1) {
  let active = true, total = 0;
  return {
    accept({value}) { if (active) total += value*multiplier; },
    pause() { active = false; }, resume() { active = true; },
    read() { return total; }
  };
}
const sink = subscriber(2);
sink.accept({value:3}); sink.pause(); sink.accept({value:10}); sink.resume(); sink.accept({value:4});
console.log(sink.read());
