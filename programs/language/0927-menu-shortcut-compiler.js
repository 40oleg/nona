const shortcuts = {}, log = [];
function install(entries,prefix = []) {
  for (const entry of entries) {
    const path = [...prefix,entry.label];
    if (entry.children) install(entry.children,path);
    else shortcuts[entry.key] = () => log.push(path.join('/'));
  }
}
install([{label:'File',children:[{label:'Save',key:'s'},{label:'Open',key:'o'}]}]);
shortcuts.s(); shortcuts.o();
console.log(JSON.stringify(log));
