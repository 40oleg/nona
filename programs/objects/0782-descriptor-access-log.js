const reads = [];
const report = { department: "sales", base: 10 };
Object.defineProperty(report, "forecast", {
  enumerable: true,
  get() { reads.push("forecast"); return this.base * 3; }
});
const descriptors = Object.getOwnPropertyDescriptors(report);
const ordinary = Object.fromEntries(Object.entries(descriptors).filter(([, descriptor]) => Object.hasOwn(descriptor, "value") && descriptor.enumerable).map(([key, descriptor]) => [key, descriptor.value]));
const inspectionReads = reads.length;
const published = { ...report };
console.log(JSON.stringify({ ordinary, inspectionReads, published, reads }));
