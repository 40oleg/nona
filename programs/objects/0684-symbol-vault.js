const secret = Symbol("secret");
const vault = { visible: "label", [secret]: [4, 7] };
Object.defineProperty(vault, "hidden", { value: 11, enumerable: false });
const keys = Reflect.ownKeys(vault).map(key => typeof key === "symbol" ? key.description : key);
const clone = { ...vault };
console.log(JSON.stringify({
  keys,
  publicKeys: Object.keys(clone),
  secretTotal: clone[secret].reduce((a, b) => a + b, 0),
  hiddenCopied: Object.hasOwn(clone, "hidden")
}));
