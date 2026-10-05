function test(rule,row) {
  if (rule.and) return rule.and.every(child => test(child,row));
  if (rule.or) return rule.or.some(child => test(child,row));
  const {field,min,max} = rule, value = row[field] ?? 0;
  return (min === undefined || value >= min) && (max === undefined || value <= max);
}
const rule = {and:[{field:'age',min:18},{or:[{field:'score',min:8},{field:'bonus',min:1}]}]};
const people = [{age:20,score:7,bonus:1},{age:16,score:10},{age:30,score:9}];
const selected = people.filter(row => test(rule,row));
console.log(JSON.stringify(selected));
