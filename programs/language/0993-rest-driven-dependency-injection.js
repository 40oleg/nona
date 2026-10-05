const services = {tax:0.2,format:value => '$'+value.toFixed(2),stock:3};
function inject(names,fn) {
  return (...args) => fn(...names.map(name => services[name]),...args);
}
const quote = inject(['tax','format'],(tax,format,price) => format(price*(1+tax)));
const available = inject(['stock'],(stock,count) => count <= stock);
const [first,second] = [quote(10),available(4)];
console.log(first);
console.log(second);
console.log(available(2));
