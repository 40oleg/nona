import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {runOnHost} from './helpers/host.js';

test('native module request discovery traverses deep trees in source order',()=>{
 const implementation=readFileSync(new URL('../src/frontend/modules.js',import.meta.url),'utf8')
  .replace(/^import .*;\r?\n/gm,'').replace(/^export /gm,'');
 const source=`(function(){${implementation}
 const span={start:0,end:1};
 const request=value=>({kind:'ImportCall',span,argument:{kind:'Literal',span,value}});
 let expression=request('./first.mjs');
 for(let i=0;i<2200;i++)expression={kind:'Binary',span,operator:'+',left:expression,right:{kind:'Literal',span,value:'x'}};
 const result=moduleRequests({body:[{kind:'Import',source:'./static.mjs',span},{kind:'ExpressionStatement',span,expression},request('./last.mjs')]});
 console.log(JSON.stringify(result));})();`;
 const oracle=spawnSync(process.execPath,['-'],{input:source,encoding:'utf8',timeout:10_000,windowsHide:true});
 assert.equal(oracle.status,0,oracle.stderr);
 assert.equal(oracle.stdout,'{"static":["./static.mjs"],"dynamic":["./first.mjs","./last.mjs"],"computed":false}\n');
 const native=runOnHost(source,{gcStress:false});
 assert.equal(native.status,0,String(native.error??native.stderr));
 assert.equal(native.stdout,oracle.stdout);
});
