import { modulesCommonjs } from "../lib/sources.generated.js";

/**
 * `nona:internal/commonjs`: the CommonJS loader the compiled program runs
 * (see src/frontend/commonjs.ts for how module records use it).
 *
 * A factory record's default export is a *record* made by `define`: the
 * module wrapper, the file names and the require table, whose entries are
 * `[resolved file name, getter, kind]` with kind 0 for a CommonJS record,
 * 1 for an ES module namespace and 2 for a builtin module namespace. Nothing
 * of the file runs until the record is loaded: by `require`, by an `import`
 * of the file (its facade calls `importDefault`) or as the main module.
 *
 * `require.cache` is keyed by file name as in Node: a module runs once,
 * deleting its entry makes the next `require` run it again, and a module that
 * throws while it runs is removed so that a later `require` retries it.
 * The source is src/lib/modules/commonjs.js.
 */
export const commonJsModuleSource = modulesCommonjs;
