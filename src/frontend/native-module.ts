import {modulesNative} from '../lib/sources.generated.js';
/**
 * Source of `nona:internal/native`: the native helpers of node:net and
 * node:http (see src/runtime/http-native.ts). The code generator installs
 * them as global functions when a program can reach them; this module takes
 * them off the global object so programs cannot see them.
 */
export const nativeModuleSource=modulesNative;
