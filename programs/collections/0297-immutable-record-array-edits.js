const queue = ["a","b","c","d"];
const replaced = queue.slice();
replaced[1]="urgent";
const inserted = replaced.slice();
inserted.splice(2,1,"x","y");
const reversed = inserted.slice().reverse();
const comparisons = {
  original:queue.join(""),
  inserted:inserted.join("/"),
  reversed:reversed.join("/"),
  lengthDelta:inserted.length-queue.length
};
console.log(JSON.stringify(comparisons));
