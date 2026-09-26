for (var x of [1e20, 1e100, 1e300, Number.MAX_VALUE]) {
  console.log(Number.isFinite(Math.sin(x)), Number.isFinite(Math.cos(x)), Number.isFinite(Math.tan(x)));
  console.log(Math.abs(Math.sin(x)) <= 1, Math.abs(Math.cos(x)) <= 1);
}
