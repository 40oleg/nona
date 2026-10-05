const slots = Array(7).fill(null), deleted = 'tombstone';
const hash = key => key.charCodeAt(0) % slots.length;
function put(key, value) { let index = hash(key); while (slots[index] && slots[index] !== deleted && slots[index][0] !== key) index = (index + 1) % slots.length; slots[index] = [key, value]; }
function find(key) { let index = hash(key); for (let probes = 0; probes < slots.length; probes++) { const slot = slots[index]; if (!slot) return -1; if (slot !== deleted && slot[0] === key) return index; index = (index + 1) % slots.length; } return -1; }
put('a', 1); put('h', 2); put('o', 3); slots[find('h')] = deleted;
const surviving = slots[find('o')][1]; put('v', 4);
console.log(surviving + ':' + find('v') + ':' + find('h'));
