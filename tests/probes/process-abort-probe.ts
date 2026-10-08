/** Child-only abort fixture: abrupt termination bypasses every JS lifecycle path. */
export const processAbortProbeSource=String.raw`
process.on('exit',function(){console.log('unexpected exit')});
process.on('beforeExit',function(){console.log('unexpected beforeExit')});
process.on('uncaughtException',function(){console.log('unexpected exception')});
process.setUncaughtExceptionCaptureCallback(function(){console.log('unexpected capture')});
var retained={};process.finalization.register(retained,function(){console.log('unexpected finalization')});
process.nextTick(function(){console.log('unexpected tick')});
setTimeout(function(){console.log('unexpected timer')},1);
process.abort();console.log('unexpected return');
`;
