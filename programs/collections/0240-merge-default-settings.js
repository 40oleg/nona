const defaults = {color:"blue",enabled:true,size:4};
const overrides = [{enabled:false},{color:"red",extra:2},{size:0}];
let settings = {...defaults};
const touched = new Set();
for (const override of overrides) {
  settings = {...settings,...override};
  for (const [key] of Object.entries(override)) touched.add(key);
}
const changed = Array.from(touched).filter(key => settings[key]!==defaults[key]);
console.log(JSON.stringify({settings,changed}));
