const rules = [
  {needs:['width','height'],target:'area',compute:({width,height}) => width*height},
  {needs:['area','price'],target:'cost',compute:({area,price}) => area*price}
];
const state = {width:3,height:4,price:2};
for (const {needs,target,compute} of rules) {
  if (needs.every(key => state[key] !== undefined)) state[target] = compute({...state});
}
const {cost,...dimensions} = state;
console.log(cost);
console.log(JSON.stringify(dimensions));
