const ranges = [[8,10],[1,3],[3,6],[12,13],[7,8]];
ranges.sort((a,b) => a[0]-b[0]);
const merged = [];
for (const [start,end] of ranges) {
  const previous = merged[merged.length-1];
  if (previous && start<=previous[1]+1) previous[1]=Math.max(previous[1],end);
  else merged.push([start,end]);
}
const covered = merged.reduce((sum,[start,end]) => sum+end-start+1,0);
console.log(JSON.stringify({merged,covered}));
