function policy({minimum,allowed}) {
  const choices = [...allowed];
  return ({amount,kind}) => amount >= minimum && choices.includes(kind);
}
const config = {minimum:5,allowed:['cash']};
const original = policy(config);
config.allowed.push('card');
const updated = policy({...config,minimum:3});
const requests = [{amount:4,kind:'card'},{amount:6,kind:'cash'}];
console.log(JSON.stringify(requests.map(row => [original(row),updated(row)])));
