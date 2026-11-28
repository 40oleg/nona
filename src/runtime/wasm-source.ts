import {
    runtimeWasmNumeric,
    runtimeWasmDecode,
    runtimeWasmExecute,
    runtimeWasmApi,
} from "../lib/sources.generated.js";

/** Original in-process scalar WebAssembly, compiled into the executable. */
export const wasmPreludeSource = [
    runtimeWasmNumeric,
    runtimeWasmDecode,
    runtimeWasmExecute,
    runtimeWasmApi,
].join("\n");
