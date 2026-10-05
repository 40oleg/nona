const groups = {};
const events = [{source:'ui',type:'click',x:2},{source:'api',type:'reply',code:200},{source:'ui',type:'key',key:'Enter'}];
for (const {source,type,...detail} of events) {
  const bucket = groups[source] ??= [];
  bucket.push({type,...detail});
}
const summary = Object.entries(groups).map(([source,rows]) => ({source,count:rows.length,types:rows.map(({type}) => type)}));
console.log(JSON.stringify(groups));
console.log(JSON.stringify(summary));
console.log(events.length);
