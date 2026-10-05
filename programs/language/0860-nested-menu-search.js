function* actions(menu, prefix = []) {
  for (const {label,children,id} of menu) {
    const path = [...prefix,label];
    if (children) yield* actions(children,path);
    else yield {id,path};
  }
}
const menu = [{label:'File',children:[{label:'Open',id:'open'},{label:'Save',id:'save'}]},{label:'Help',id:'help'}];
const listed = [...actions(menu)];
console.log(listed.find(({id}) => id === 'save').path.join(' > '));
console.log(JSON.stringify(listed.map(({id}) => id)));
