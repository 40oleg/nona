import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runOnHost} from './helpers/host.js';
import {runOracle} from './helpers/oracle.js';

// This fixture is Nona's own lowered RegExp VM function, captured while
// bootstrapping the compiler. No external implementation is embedded here.
const fixture=readFileSync(new URL('../../tests/fixtures/selfhost-regexp-run-ir.json',import.meta.url),'utf8');
const algorithms=['liveness','copies'].map(name=>readFileSync(new URL(`../src/ir/${name}.js`,import.meta.url),'utf8')
 .replace(/^import .*;\r?\n/gm,'').replace(/^export /gm,'')).join('\n');
const source=`(function(){
${algorithms}
const fn=JSON.parse(${JSON.stringify(fixture)});
const sets=analyzeLiveness(fn);
for(const block of fn.blocks){
 const info=sets.get(block.id);
 console.log(block.id,[...info.liveIn].sort((a,b)=>a-b).join(','),[...info.liveOut].sort((a,b)=>a-b).join(','));
}
const optimized=propagateCopies(fn);
const block=optimized.blocks.find(block=>block.id===171);
console.log('copy32',block.operations.some(op=>op.kind==='copy'&&op.dest===32&&op.source===709));
})();`;

test('self-hosted liveness agrees with Node on the RegExp VM control-flow graph',()=>{
 const oracle=runOracle(source);
 assert.match(oracle.stdout,/copy32 true\n$/);
 // The bootstrap uses the normal collector; stressing this complete fixed
 // point allocates millions of snapshots and exceeds the host helper timeout.
 const native=runOnHost(source,{gcStress:false});
 assert.equal(native.status,0,String(native.error??native.stderr));
 assert.equal(native.stdout,oracle.stdout);
});
