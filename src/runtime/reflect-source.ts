import {runtimeReflect} from '../lib/sources.generated.js';
// Bootstrap ordinary-object Reflect operations in the native program. Proxy
// interception and newTarget-sensitive construction need runtime support.
export const reflectPreludeSource=runtimeReflect;
