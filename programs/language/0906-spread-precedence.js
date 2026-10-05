const system = {theme:'light',size:10,enabled:true};
const account = {theme:'dark',size:12};
const document = {size:0,enabled:false};
function resolve(...layers) {
  return layers.reduce((result,layer) => ({...result,...layer}),{});
}
const settings = resolve(system,account,document);
const {theme,...controls} = settings;
console.log(theme);
console.log(JSON.stringify(controls));
console.log(settings.size ?? 99);
