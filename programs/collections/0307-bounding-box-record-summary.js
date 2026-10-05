const points = [[1,3],[4,2],[2,5],[3,3]];
const box = points.reduce((bounds,[x,y])=>{
  bounds.minX=Math.min(bounds.minX,x);
  bounds.maxX=Math.max(bounds.maxX,x);
  bounds.minY=Math.min(bounds.minY,y);
  bounds.maxY=Math.max(bounds.maxY,y);
  return bounds;
},{minX:Infinity,maxX:-Infinity,minY:Infinity,maxY:-Infinity});
const interior = points.filter(([x,y])=>x>box.minX&&x<box.maxX&&y>box.minY&&y<box.maxY);
const area = (box.maxX-box.minX)*(box.maxY-box.minY);
console.log(JSON.stringify({box,interior,area}));
