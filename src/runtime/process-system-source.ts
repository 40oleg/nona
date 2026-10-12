/** Original OS process helpers, inserted inside the lazy process build. */
import { processAccountsSource } from "./process-accounts-source.js";
import { processExecSource } from "./process-exec-source.js";
import { processTitleSource } from "./process-title-source.js";
import { runtimeProcessSystem } from "../lib/sources.generated.js";
export const processSystemSource = String.raw(
    runtimeProcessSystem,
    processExecSource,
    processTitleSource,
    processAccountsSource,
);
