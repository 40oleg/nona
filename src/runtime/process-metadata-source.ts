import {nonaVersion} from '../version.js';

/** Genuine compiler metadata; intentionally contains no Node dependency claims. */
export function processMetadataSource(version=nonaVersion,captured=false):string {
 const define=captured?'defineProperty':'Object.defineProperty',freeze=captured?'freeze':'Object.freeze';
 return String.raw`
    ${define}(process,'version',{value:${JSON.stringify('v'+version)},enumerable:true,configurable:true});
    ${define}(process,'versions',{value:{nona:${JSON.stringify(version)}},enumerable:true,configurable:true});
    ${define}(process,'release',{value:{name:'nona'},enumerable:true,configurable:true});
    ${define}(process,'features',{value:{aot:true,inspector:false,uv:false,tls:false,tls_alpn:false,tls_sni:false,tls_ocsp:false,ipv6:false,require_module:false,cached_builtins:false,typescript:false},enumerable:true});
    ${define}(process,'config',{value:${freeze}({runtime:'nona',version:${JSON.stringify(version)},target:platform+'-'+process.arch}),enumerable:true,configurable:true});
 `;
}
