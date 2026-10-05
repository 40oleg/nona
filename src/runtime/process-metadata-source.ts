import {nonaVersion} from '../version.js';

/** Genuine compiler metadata; intentionally contains no Node dependency claims. */
export function processMetadataSource(version=nonaVersion):string {
 return String.raw`
    Object.defineProperty(process,'version',{value:${JSON.stringify('v'+version)},enumerable:true,configurable:true});
    Object.defineProperty(process,'versions',{value:{nona:${JSON.stringify(version)}},enumerable:true,configurable:true});
    Object.defineProperty(process,'release',{value:{name:'nona'},enumerable:true,configurable:true});
    Object.defineProperty(process,'features',{value:{aot:true,inspector:false,uv:false,tls:false,tls_alpn:false,tls_sni:false,tls_ocsp:false,ipv6:false,require_module:false,cached_builtins:false,typescript:false},enumerable:true});
    Object.defineProperty(process,'config',{value:Object.freeze({runtime:'nona',version:${JSON.stringify(version)},target:platform+'-'+process.arch}),enumerable:true,configurable:true});
 `;
}
