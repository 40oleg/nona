const settings = Object.seal({ mode: "draft", count: 1 });
const changes = [
  Reflect.set(settings, "count", 4),
  Reflect.set(settings, "extra", true),
  Reflect.deleteProperty(settings, "mode")
];
console.log(JSON.stringify({
  changes,
  settings,
  sealed: Object.isSealed(settings)
}));
