function budget(initial) {
  let balance = initial;
  return {
    spend(cost) { balance -= cost; return balance; },
    fork(extra) { return budget(balance + extra); },
    read() { return balance; }
  };
}
const parent = budget(100), child = parent.fork(20);
const history = [child.spend(30),parent.spend(10),child.spend(5)];
console.log(JSON.stringify([...history,parent.read(),child.read()]));
