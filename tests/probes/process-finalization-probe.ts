/** Original deterministic GC-stress probe: dead weak keys release callbacks. */
export const processFinalizationProbeSource=String.raw`
var live={id:7};process.finalization.register(live,function(ref,event){console.log(ref.id,event)});
(function(){var other={};process.finalization.register(other,function(){console.log('unexpected retained target')});
 var dead={};var callback=(function(captured){return function(){console.log(captured)}})(other);
 process.finalization.register(dead,callback)})();
(function(){var captured={id:9};process.finalization.register(captured,function(ref,event){console.log(captured===ref,event)})})();
for(var index=0;index<20;index++)({index:index});console.log('registered');
`;
export const processFinalizationProbeExpected='registered\n7 exit\ntrue exit\n';
