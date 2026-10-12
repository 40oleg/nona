import type { Token } from "./token.js";

/**
 * Import attributes after a module specifier (`with {type: 'json'}`, and the
 * older `assert {…}`): the index of the token after them, or an error message.
 * Nona accepts and ignores them; the module host decides how a file is read.
 */
export function skipImportAttributes(
    tokens: readonly Token[],
    index: number,
): number | string {
    const at = (offset: number) => tokens[index + offset];
    if (
        !(at(0)?.text === "with" || at(0)?.text === "assert") ||
        at(1)?.text !== "{"
    )
        return index;
    index += 2;
    while (at(0)?.text !== "}") {
        if (at(0)?.kind !== "string" && at(0)?.kind !== "word")
            return "Expected an import attribute key";
        if (at(1)?.text !== ":") return "Expected ':' in an import attribute";
        if (at(2)?.kind !== "string")
            return "Expected an import attribute value string";
        index += 3;
        if (at(0)?.text === ",") index++;
        else if (at(0)?.text !== "}")
            return "Expected ',' or '}' in import attributes";
    }
    return index + 1;
}
