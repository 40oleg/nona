const record = {name:"Ada",score:5};
Object.defineProperty(record,"internal",{value:9,enumerable:false,writable:false});
const keys = Object.keys(record);
const copied = {...record};
const descriptor = Object.getOwnPropertyDescriptor(record,"internal");
const report = {
  keys,copied,
  hiddenValue:record.internal,
  flags:[descriptor.enumerable,descriptor.writable,descriptor.configurable]
};
console.log(JSON.stringify(report));
