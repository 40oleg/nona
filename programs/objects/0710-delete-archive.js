const archive = [];
const record = new Proxy({ name: "draft", temporary: 42 }, {
  deleteProperty(target, key) {
    if (Object.hasOwn(target, key)) archive.push([key, target[key]]);
    return Reflect.deleteProperty(target, key);
  }
});
delete record.temporary;
delete record.missing;
console.log(JSON.stringify({ record, archive }));
