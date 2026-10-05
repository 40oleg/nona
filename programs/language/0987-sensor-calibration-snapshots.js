function sensor(initialOffset,limit) {
  let offset = initialOffset;
  const live = raw => ({value:raw-offset,alarm:raw-offset > limit});
  return {
    calibrate(next) { offset = next; },
    checkpoint(label) { const saved = offset; return raw => ({label,value:raw-saved}); },
    read:live
  };
}
const monitor = sensor(2,5), baseline = monitor.checkpoint('factory');
monitor.calibrate(4); const adjusted = monitor.checkpoint('field');
const readings = [8,10].map(raw => ({raw,current:monitor.read(raw),history:[baseline(raw),adjusted(raw)]}));
const alarms = readings.filter(({current:{alarm}}) => alarm).map(({raw}) => raw);
console.log(JSON.stringify({readings,alarms:[...alarms]}));
