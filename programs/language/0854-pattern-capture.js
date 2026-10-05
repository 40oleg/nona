const rules = [
  {tag:'move',run:({x,y}) => x+','+y},
  {tag:'say',run:({text,...meta}) => text+':'+Object.keys(meta).length},
  {tag:'stop',run:() => 'halt'}
];
function dispatch(message) {
  const rule = rules.find(({tag}) => tag === message.tag);
  return rule?.run(message) ?? 'ignored';
}
const messages = [{tag:'move',x:2,y:5},{tag:'say',text:'hi',level:1},{tag:'unknown'}];
console.log(JSON.stringify(messages.map(dispatch)));
