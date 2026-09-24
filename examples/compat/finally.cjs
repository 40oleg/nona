function result(mode) {
  try {
    try {
      if (mode === 0) return {value: 7};
      throw {value: 8};
    } catch (error) {
      console.log('catch', error.value);
      if (mode === 1) return error;
      throw error;
    } finally {
      console.log('inner', mode);
    }
  } finally {
    console.log('outer', mode);
    if (mode === 2) return {value: 9};
  }
}
console.log(result(0).value, result(1).value, result(2).value);
let total = 0;
outer: for (let i = 0; i < 4; i++) {
  try {
    try {
      if (i === 0) continue outer;
      if (i === 2) break outer;
      total += i;
    } finally {
      total += 10;
    }
  } finally {
    total += 100;
  }
}
console.log(total);
try {
  try { throw {message: 'original'}; }
  finally {
    try { throw 'temporary'; } catch (value) { console.log(value); }
  }
} catch (error) { console.log(error.message); }
