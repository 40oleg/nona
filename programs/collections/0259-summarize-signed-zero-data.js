const values = [0,-0,3,-2,NaN,0,-0];
const stats = values.reduce((counts,value) => {
  if (Number.isNaN(value)) counts.nan++;
  else if (Object.is(value,-0)) counts.negativeZero++;
  else if (value===0) counts.zero++;
  else if (value>0) counts.positive++;
  else counts.negative++;
  return counts;
},{nan:0,negativeZero:0,zero:0,positive:0,negative:0});
console.log(JSON.stringify(stats));
