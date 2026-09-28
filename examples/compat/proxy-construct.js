const events=[];
function Target(value){this.value=value}
const trapped=new Proxy(Target,{
 get(target,key,receiver){if(key==='prototype')events.push('get prototype');return Reflect.get(target,key,receiver)},
 construct(target,args){events.push('construct');return {value:args[0]}}
});
console.log(new trapped(3).value,events.join(','));
const forwarded=new Proxy(new Proxy(Target,{}),{});
console.log(new forwarded(4).value);
