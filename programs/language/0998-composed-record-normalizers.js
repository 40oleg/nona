function normalize(...steps) {
  return record => steps.reduce((current,step) => step(current),{...record});
}
const clean = normalize(
  ({name,...rest}) => ({...rest,name:name.trim()}),
  ({age,...rest}) => ({...rest,age:Number(age)}),
  record => ({...record,adult:record.age >= 18})
);
const original = {name:' Ada ',age:'20',id:7};
console.log(JSON.stringify({original,clean:clean(original)}));
