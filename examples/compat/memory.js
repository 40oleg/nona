function exercise(count) {
  let total = 0;
  const retained = {first: "", last: ""};
  for (let i = 0; i < count; i++) {
    const item = {text: "" + i};
    item.self = item;
    const shared = [item, item];
    total += +shared[0].text;
    if (i === 0) retained.first = item.text;
    retained.last = item.text;
  }
  console.log("retained", retained.first, retained.last);
  return total;
}
console.log("allocation cycles", exercise(3000));
