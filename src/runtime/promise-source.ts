import {runtimePromise} from '../lib/sources.generated.js';
// Promise reactions run after the top-level program, before native shutdown.
// This is compiled by the same frontend as user code.
export const promisePreludeSource=runtimePromise;
