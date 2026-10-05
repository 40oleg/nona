import type {Target} from '../target.js';
import {pathHostSource} from './path-host.js';
import {pathOriginalSource} from './path-original-source.js';
import {pathGlobOriginalSource} from './path-glob-original-source.js';

/** Original Nona-owned implementation; Node.js is a behavioral oracle only. */
const implementation=pathGlobOriginalSource+pathOriginalSource;
export const pathModuleSource='const pathHost=globalThis.process;\n'+implementation;
export function pathModuleSourceForTarget(target:Target):string {return pathHostSource(target)+implementation;}
