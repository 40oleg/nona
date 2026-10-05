const crew = {pilot:'Ada',navigator:'Bo',engineer:'Cy',ship:'Kite'};
function rotate({pilot,navigator,engineer,...details}) {
  [pilot,navigator,engineer] = [engineer,pilot,navigator];
  return {...details,pilot,navigator,engineer};
}
let current = crew;
const log = [];
for (let shift = 0; shift < 3; shift++) {
  current = rotate(current); log.push(current.pilot);
}
console.log(JSON.stringify({log,restored:current.pilot === crew.pilot,ship:current.ship}));
