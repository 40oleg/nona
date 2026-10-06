import {compileModuleToIR,compileToIR} from '../compiler.js';
import {collectSourceUsage} from '../frontend/lexer.js';
import {getTarget,type Target} from '../target.js';
import {generate} from './x64/codegen.js';
import {withNativeTarget} from './machine/context.js';
import {linkPe} from './pe/writer.js';
import {linkWindowsArm64} from './arm64/windows.js';
import {linkLinux} from './linux/index.js';
import {linkDarwin} from './darwin/index.js';
import {linkBsd} from './bsd/index.js';
import {processReportProbe,processReportUncaughtProbe,processReportHandledProbe,processReportFatalConfigurationProbe,processReportNetworkProbe,processReportAllocationFailureProbe} from '../runtime/process-report-probe.js';

/** Native report creation, exception policy and actual interface enumeration. */
export function processReportPlatformProbes(target:Target){
 const cases=[
  {name:'process-report-api',source:processReportProbe,expected:'true true true true true true true\ntrue\ntrue\n',status:0},
  {name:'process-report-network',source:processReportNetworkProbe,expected:'true true true true\n',status:0},
  {name:'process-report-uncaught',source:processReportUncaughtProbe,expected:'',status:1},
  {name:'process-report-handled',source:processReportHandledProbe,expected:'nona-report-handled\n',status:0},
  {name:'process-report-fatal-disabled',source:processReportFatalConfigurationProbe,expected:'true\n',status:0},
  {name:'process-report-allocation-failure',source:processReportAllocationFailureProbe(target),expected:'armed\n',status:1,module:true},
 ];
 return cases.map(probe=>{
  const {result:ir,usage}=collectSourceUsage(()=>'module' in probe?compileModuleToIR(probe.source,probe.name+'.mjs',undefined,'',target):compileToIR(probe.source,probe.name+'.js',undefined,target));
  const program=withNativeTarget(target,()=>generate(ir,{gcStress:true,link:usage})),descriptor=getTarget(target)!;
  const image=descriptor.os==='win32'?(target==='win32-arm64'?linkWindowsArm64(program):linkPe(program)):descriptor.os==='linux'?linkLinux(program,descriptor.arch):descriptor.os==='darwin'?linkDarwin(program,descriptor.arch):linkBsd(program,descriptor.os);
  return {name:probe.name,image,expected:probe.expected,status:probe.status,minimalEnvironment:true};
 });
}
