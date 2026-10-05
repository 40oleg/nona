const seats = new Array(6);
seats[1] = "Ada";
seats[3] = undefined;
seats[5] = "Bo";
const holes = [];
const occupied = [];
for (let i=0;i<seats.length;i++) {
  if (!(i in seats)) holes.push(i);
  else if (seats[i] !== undefined) occupied.push(i + ":" + seats[i]);
}
console.log(JSON.stringify({holes,occupied}));
