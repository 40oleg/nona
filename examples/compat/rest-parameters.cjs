function collect(first, ...rest) {
  return first + ':' + rest.join('|');
}

var count = (...values) => values.length;
console.log(collect('a', 1, 2, 3), count(4, 5, 6));
