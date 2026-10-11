import {runtimeEncoding} from '../lib/sources.generated.js';
// TextEncoder/TextDecoder (UTF-8 only), installed as globals like in Node.js
// and browsers. The prelude adds no prelude globals.
export const encodingPreludeSource=runtimeEncoding;
