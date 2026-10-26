import {
    modulesStream,
    modulesStreamPromises,
    modulesStreamConsumers,
    modulesStreamWeb,
} from "../lib/sources.generated.js";
/** Thin providers share the constructors installed by the stream prelude. */
export const streamModuleSource = modulesStream;

export const streamPromisesModuleSource = modulesStreamPromises;

export const streamConsumersModuleSource = modulesStreamConsumers;

export const streamWebModuleSource = modulesStreamWeb;
