const pages = [null, null, null], referenced = [false, false, false]; let hand = 0, faults = 0;
for (const page of [1, 2, 3, 1, 4, 2, 5]) {
  const present = pages.indexOf(page);
  if (present >= 0) { referenced[present] = true; continue; }
  faults++;
  while (referenced[hand]) { referenced[hand] = false; hand = (hand + 1) % 3; }
  pages[hand] = page; referenced[hand] = true; hand = (hand + 1) % 3;
}
console.log(faults + ':' + pages.join(',') + ':' + hand);
