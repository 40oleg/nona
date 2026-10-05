class Basket {
  constructor(label) { this.label = label; this.items = []; }
  add(...items) { this.items.push(...items); return this.label+':'+this.items.length; }
}
const north = new Basket('north'), south = new Basket('south');
const addNorth = north.add.bind(north,'apple');
console.log(addNorth('pear'));
console.log(north.add.call(south,'plum'));
const delegate = (...items) => north.add.apply(south,items);
console.log(delegate('fig','lime'));
console.log(JSON.stringify({north:north.items,south:south.items}));
