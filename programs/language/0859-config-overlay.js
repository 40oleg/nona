const base = {network:{host:'local',port:80},logging:{level:'info'},retries:3};
const override = {network:{port:0},logging:{level:'debug'},retries:null};
function configure(a,b) {
  const {network:netA,logging:logA,...restA} = a;
  const {network:netB,logging:logB,...restB} = b;
  return {...restA,...restB,network:{...netA,...netB},logging:{...logA,...logB},retries:b.retries ?? a.retries};
}
const settings = configure(base,override);
const {network:{host,port},logging:{level}} = settings;
console.log(host+':'+port+'/'+level);
console.log(JSON.stringify(settings));
