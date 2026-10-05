function route(pattern) {
  const expected = pattern.split('/');
  return path => {
    const actual = path.split('/'), params = {};
    if (actual.length !== expected.length) return null;
    for (let i = 0; i < expected.length; i++) {
      if (expected[i][0] === ':') params[expected[i].slice(1)] = actual[i];
      else if (expected[i] !== actual[i]) return null;
    }
    return params;
  };
}
const match = route('/teams/:team/users/:user');
console.log(JSON.stringify(['/teams/red/users/ada','/other'].map(path => match(path)?.user ?? 'miss')));
