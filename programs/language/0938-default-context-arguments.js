function request({path='/',options:{method='GET',retry=1} = {}} = {},...labels) {
  return {path,method,retry,labels};
}
const requests = [];
requests.push(request());
requests.push(request({path:'/save',options:{method:'POST',retry:0}},'editor','urgent'));
requests.push(request({options:{}}));
const summary = requests.map(({method,path}) => method+' '+path);
console.log(JSON.stringify(requests));
console.log(summary.join('|'));
