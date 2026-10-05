function* states(initial, actions) {
  let state = {...initial};
  yield {...state};
  for (const {field,delta} of actions) {
    state = {...state,[field]:(state[field] ?? 0)+delta};
    yield {...state};
  }
}
const snapshots = [...states({x:1},[{field:'x',delta:3},{field:'y',delta:2},{field:'x',delta:-1}])];
snapshots[0].x = 99;
console.log(JSON.stringify(snapshots));
