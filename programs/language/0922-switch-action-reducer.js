function reduce(state,{type,...payload}) {
  switch (type) {
    case 'rename': return {...state,name:payload.name};
    case 'add': return {...state,items:[...state.items,payload.item]};
    case 'clear': return {...state,items:[]};
    default: throw new Error('action:'+type);
  }
}
let state = {name:'draft',items:[]};
for (const action of [{type:'add',item:3},{type:'rename',name:'ready'},{type:'add',item:5}]) state = reduce(state,action);
console.log(JSON.stringify(state));
