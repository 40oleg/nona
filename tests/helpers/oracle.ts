import {spawnSync} from 'node:child_process';
export function runOracle(source:string,options:{timezone?:string}={}):{stdout:string;status:number|null}{
 // Evaluate the source as its own Script so the console adapter cannot end its
 // directive prologue. Script var/this semantics also remain global.
 const script='console.log=((write,stringify)=>(...args)=>{write(args.map(stringify).join(" ")+"\\n");})(process.stdout.write.bind(process.stdout),String);\nrequire("node:vm").runInThisContext('+JSON.stringify(source)+');';
 const run=spawnSync(process.execPath,['-e',script],{encoding:'utf8',timeout:5000,windowsHide:true,
  ...(options.timezone===undefined?{}:{env:{...process.env,TZ:options.timezone}})});
 if(run.error)throw run.error;
 if(run.status!==0)throw new Error(run.stderr);
 return {stdout:run.stdout,status:run.status};
}
