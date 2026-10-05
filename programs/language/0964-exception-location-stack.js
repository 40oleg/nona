function check(node,path = []) {
  const here = [...path,node.name];
  try {
    if (node.value === false) throw new Error('disabled');
    for (const child of node.children ?? []) check(child,here);
  } catch(error) {
    if (!error.message.includes('/')) throw new Error(here.join('/')+':'+error.message);
    throw error;
  }
}
try { check({name:'root',children:[{name:'group',children:[{name:'leaf',value:false}]}]}); }
catch(error) { console.log(error.message); }
