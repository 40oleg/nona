import {runInContext,type Context} from 'node:vm';
import {encodingPreludeSource} from '../../src/runtime/encoding-source.js';
import {bufferPreludeSource} from '../../src/runtime/buffer-source.js';
import {eventsPreludeSource} from '../../src/runtime/events-source.js';
import {asyncHooksPreludeSource} from '../../src/runtime/async-hooks-source.js';
import {eventEmitterPreludeSource} from '../../src/runtime/event-emitter-source.js';
import {streamPreludeForTarget} from '../../src/runtime/stream-source.js';
import type {Target} from '../../src/target.js';

/** Install the same original dependencies and order as the native compiler. */
export function installProcessDependencies(context:Context,target:string='linux-x64'):void {
 runInContext(encodingPreludeSource+bufferPreludeSource+eventsPreludeSource+asyncHooksPreludeSource+eventEmitterPreludeSource+streamPreludeForTarget(target as Target),context);
}
