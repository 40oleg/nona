/** Original process I/O, events and OS controls; inserted inside build(). */
import {processSystemSource} from './process-system-source.js';
import {processExceptionsSource} from './process-exceptions-source.js';
import {processFinalizationSource} from './process-finalization-source.js';
import {processSignalsSource} from './process-signals-source.js';
import {runtimeProcessExtensions} from '../lib/sources.generated.js';
export const processExtensionsSource=String.raw(runtimeProcessExtensions,processSignalsSource,processSystemSource,processExceptionsSource,processFinalizationSource);
