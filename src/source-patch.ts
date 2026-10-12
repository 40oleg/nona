/**
 * Target-specific edits of built-in JavaScript sources (src/lib). An edit
 * whose text is not found throws instead of silently leaving the source
 * unchanged, so that reformatting a source cannot break a target unnoticed.
 * `to` is inserted literally (no `$` patterns); a function receives the match.
 */
export function patchSource(
    source: string,
    from: string | RegExp,
    to: string | ((match: string) => string),
    options: { all?: boolean } = {},
): string {
    const found =
        typeof from === "string"
            ? source.includes(from)
            : new RegExp(from.source, from.flags.replace("g", "")).test(source);
    if (!found)
        throw new Error(
            `Built-in source edit does not match: ${String(from).slice(0, 120)}`,
        );
    const replacement = typeof to === "string" ? () => to : to;
    if (typeof from === "string" && options.all)
        return source.replaceAll(from, replacement);
    return source.replace(from, replacement);
}
