const movements = [{id:"a",amount:7},{id:"b",amount:-2},{id:"c",amount:0},{id:"d",amount:3},{id:"e",amount:-5}];
const groups = movements.reduce((result,movement) => {
  const key = movement.amount>0 ? "credit" : movement.amount<0 ? "debit" : "zero";
  result[key].push(movement.id);
  return result;
},{credit:[],debit:[],zero:[]});
const net = movements.reduce((sum,movement) => sum+movement.amount,0);
const active = groups.credit.length+groups.debit.length;
const result = {groups,net,active};
console.log(JSON.stringify(result));
