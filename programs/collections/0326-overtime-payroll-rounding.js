const workers = [{name:"Ada",hours:42,rate:1200},{name:"Bo",hours:35,rate:1500},{name:"Cy",hours:45,rate:1000}];
const payroll = workers.map(worker=>{
  const regular = Math.min(worker.hours,40)*worker.rate;
  const overtime = Math.max(worker.hours-40,0)*worker.rate*1.5;
  return {name:worker.name,cents:Math.round(regular+overtime)};
});
const total = payroll.reduce((sum,row)=>sum+row.cents,0);
const overtimeWorkers = workers.filter(worker=>worker.hours>40).map(worker=>worker.name);
const report = {payroll,total,overtimeWorkers};
console.log(JSON.stringify(report));
