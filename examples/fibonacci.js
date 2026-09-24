function fibonacci(n) {
  if (n < 2) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}
for (var i = 0; i < 12; i++) console.log(i, fibonacci(i));
