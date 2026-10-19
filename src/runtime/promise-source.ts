import { runtimePromise } from "../lib/sources.generated.js";
// Promise reactions run after the top-level program, before native shutdown.
// This is compiled by the same frontend as user code.
export const promisePreludeSource = runtimePromise;
import {
    runtimeClassElements,
    runtimeEvalCode,
    runtimeJsonResponse,
    runtimeModuleRecords,
    runtimeTopLevelAwait,
    runtimeWithStatement,
} from "../lib/sources.generated.js";
// Helpers that only some syntax needs (#278), linked when the lowered program
// calls them (see syntaxHelperParts in src/link.ts).
export const withStatementPreludeSource = runtimeWithStatement;
export const evalCodePreludeSource = runtimeEvalCode;
export const classElementsPreludeSource = runtimeClassElements;
export const moduleRecordsPreludeSource = runtimeModuleRecords;
export const topLevelAwaitPreludeSource = runtimeTopLevelAwait;
export const jsonResponsePreludeSource = runtimeJsonResponse;
