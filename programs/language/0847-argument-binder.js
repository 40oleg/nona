function bind(signature, positional, named = {}) {
  const result = {};
  for (let i = 0; i < signature.length; i++) {
    const {name, fallback} = signature[i];
    result[name] = named[name] ?? positional[i] ?? fallback;
  }
  return result;
}
const signature = [{name:'width',fallback:1},{name:'height',fallback:1},{name:'unit',fallback:'px'}];
const rectangle = ({width,height,unit}) => width*height + unit + '²';
console.log(rectangle(bind(signature,[4],{height:3})));
console.log(JSON.stringify(bind(signature,[],{unit:'cm'})));
