const array=[3],proxy=new Proxy(new Proxy(array,{}),{});
console.log(Array.isArray(proxy),[].concat(proxy).join(','));
function Ctor(){}
array.constructor={[Symbol.species]:Ctor};
console.log(Object.getPrototypeOf(Array.prototype.concat.call(proxy))===Ctor.prototype);
console.log([proxy].flat().join(','),[proxy].flatMap(value=>value).join(','));
const handle=Proxy.revocable([],{});
handle.revoke();
try{Array.isArray(handle.proxy)}catch(error){console.log(error.name)}
const callable=new Proxy(new Proxy(function(){},{}),{});
console.log(Object.prototype.toString.call(callable),Function.prototype.toString.call(callable));
