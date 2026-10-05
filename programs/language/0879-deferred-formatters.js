function formatter({prefix='',digits=0,suffix=''} = {}) {
  return value => prefix+value.toFixed(digits)+suffix;
}
const percent = formatter({digits:1,suffix:'%'});
const currency = formatter({prefix:'$',digits:2});
const report = [{kind:'ratio',value:12.34},{kind:'money',value:8.5}];
const printers = {ratio:percent,money:currency};
for (const {kind,value} of report) console.log(printers[kind](value));
console.log(formatter()(42));
console.log(percent(0));
