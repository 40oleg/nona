const points = [{x:1,y:2,w:2},{x:5,y:4,w:1},{x:3,y:0,w:3}];
const sums = points.reduce((total,point)=>{
  total.x+=point.x*point.w;
  total.y+=point.y*point.w;
  total.weight+=point.w;
  return total;
},{x:0,y:0,weight:0});
const center = {x:sums.x/sums.weight,y:sums.y/sums.weight};
const nearest = points.slice().sort((a,b)=>(a.x-center.x)**2+(a.y-center.y)**2-((b.x-center.x)**2+(b.y-center.y)**2))[0];
console.log(JSON.stringify({center,nearest}));
