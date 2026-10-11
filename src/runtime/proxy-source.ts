import {runtimeProxy,runtimeProxyCleanup} from '../lib/sources.generated.js';
// The native ProxyKind object and its traps are installed by the runtime.
export const proxyPreludeSource=runtimeProxy;

// Runs last, after every optional prelude: removes the internal hooks the
// preludes captured from Function.prototype.
export const preludeCleanupSource=runtimeProxyCleanup;
