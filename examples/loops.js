var sum = 0;
for (var i = 1; i <= 10; i++) {
  if (i === 5) continue;
  sum += i;
}
console.log("Sum except 5:", sum);
