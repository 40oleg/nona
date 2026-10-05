const first = new Set(["js","compiler","native","js"]);
const second = new Set(["native","runtime","compiler"]);
const intersection = Array.from(first).filter(tag => second.has(tag));
const union = new Set([...first,...second]);
const similarity = intersection.length/union.size;
const uniqueFirst = Array.from(first).filter(tag => !second.has(tag));
const uniqueSecond = Array.from(second).filter(tag => !first.has(tag));
const report = {intersection,similarity,uniqueFirst,uniqueSecond};
console.log(JSON.stringify(report));
