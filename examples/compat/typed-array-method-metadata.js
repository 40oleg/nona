const methods=[Uint8Array.prototype.map,Uint8Array.prototype.filter,DataView.prototype.getBigInt64,BigInt.prototype.toLocaleString,Object.getPrototypeOf(Uint8Array).from];
for(const method of methods){
 let constructable=true;
 try{Reflect.construct(function(){},[],method)}catch(error){constructable=false}
 console.log(method.name,constructable,Function.prototype.toString.call(method).includes('[native code]'));
}
