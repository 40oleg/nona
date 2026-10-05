function elapsed(total) {
  const days = Math.floor(total / 86400);
  total %= 86400;
  const hours = Math.floor(total / 3600);
  total %= 3600;
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  const clock = [hours, minutes, seconds].map(n => String(n).padStart(2, '0')).join(':');
  return (days ? days + 'd ' : '') + clock;
}
console.log(JSON.stringify([0, 61, 3661, 90061].map(elapsed)));
