const slots = [10,,30,undefined,50];
delete slots[2];
slots[7] = 80;
let present = 0, sum = 0;
for (let i = 0; i < slots.length; i++) {
  if (i in slots) {
    present++;
    sum += slots[i] ?? 0;
  }
}
console.log("sparse", slots.length, present, sum, "" + slots);
slots.length = 3;
slots.length = 6;
console.log("resized", slots.length, 2 in slots, 3 in slots, 7 in slots);
slots["01"] = 7;
slots[4294967295] = 9;
console.log("keys", slots.length, slots["01"], slots[4294967295]);
const cycle = [1];
cycle[1] = cycle;
console.log("cycle", "" + cycle, !cycle, typeof cycle);
