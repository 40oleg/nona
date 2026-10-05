const state = {position:{x:0,y:0},history:[]};
let remainder;
[state.position.x,state.position.y,...remainder] = [3,5,8,13];
state.history.push(...remainder);
({x:state.position.x,y:state.position.y} = {x:state.position.y,y:state.position.x});
{
  const {position:{x,y}} = state;
  state.history.push(x+y);
}
console.log(JSON.stringify(state));
