import {runtimeUrl} from '../lib/sources.generated.js';
// The WHATWG URL and URLSearchParams globals (src/lib/runtime/url.js). The
// buffer prelude, linked after it, adds URL.createObjectURL to this URL.
export const urlPreludeSource=runtimeUrl;
