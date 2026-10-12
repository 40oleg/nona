/**
 * Node.js module resolution at compile time (issue #249).
 *
 * Nona compiles a program and everything it loads into one executable, so
 * `node_modules` is read when the program is built, never when it runs. This
 * file implements the parts of Node's resolver that decide which file a
 * specifier names:
 *
 * - relative and absolute specifiers, with the CommonJS extension and
 *   directory probing (`./x` -> `./x.js`, `./x/index.js`, `./x/package.json`
 *   "main"), which ES modules get too: Nona is lenient where Node's ESM
 *   resolver would demand the full file name;
 * - bare specifiers (`pkg`, `pkg/sub`, `@scope/pkg/sub`), looked up in every
 *   `node_modules` directory from the referrer up to the root, then through
 *   the package's `exports` (subpaths, `*` patterns, conditions, arrays) or,
 *   without `exports`, its `main` or the subpath as a file;
 * - package imports (`#name`) through the nearest package.json `imports`;
 * - self-reference: a package importing its own name through `exports`;
 * - symbolic links (pnpm stores packages under `.pnpm` and links them), which
 *   resolve to the real path so that one package is one module.
 *
 * Paths are the compiler's canonical form: `/`-separated and `/`-rooted, with
 * a Windows drive as `/C:/...`. The file system is reached through
 * `NodeFileSystem`, so that tests can resolve against a virtual tree.
 */

export interface NodeFileSystem {
    /** File contents, or undefined when it is not a readable file. */
    read(path: string): string | undefined;
    isFile(path: string): boolean;
    isDirectory(path: string): boolean;
    /** The path with symbolic links resolved (the path itself when it has none). */
    realpath(path: string): string;
}

/** `import`/`import()` versus `require()`: they select different `exports` conditions. */
export type ResolutionKind = "import" | "require";

/** Conditions Nona matches in `exports`/`imports`, in addition to "import" or "require". */
export const nodeConditions = ["nona", "node", "default"] as const;

export interface PackageJson {
    path: string;
    name?: string;
    main?: string;
    type?: string;
    exports?: unknown;
    imports?: unknown;
    bin?: unknown;
}

const dirname = (path: string): string => {
    const at = path.lastIndexOf("/");
    return at <= 0 ? "/" : path.slice(0, at);
};
const join = (directory: string, name: string): string =>
    (directory.endsWith("/") ? directory : directory + "/") + name;

/** Normalizes `.` and `..` segments of a canonical path. */
export function normalizePath(path: string): string {
    const parts: string[] = [];
    for (const segment of path.split("/")) {
        if (segment === "" || segment === ".") continue;
        if (segment === "..") {
            if (parts.length && !/^[A-Za-z]:$/.test(parts[parts.length - 1]!))
                parts.pop();
            continue;
        }
        parts.push(segment);
    }
    return "/" + parts.join("/");
}

/** Splits a bare specifier into the package name and the subpath (`.` or `./...`). */
export function parsePackageSpecifier(
    specifier: string,
): { name: string; subpath: string } | undefined {
    if (
        !specifier ||
        specifier.startsWith(".") ||
        specifier.startsWith("/") ||
        specifier.startsWith("#") ||
        specifier.includes("\\") ||
        specifier.includes("%")
    )
        return undefined;
    const parts = specifier.split("/");
    const nameParts = specifier.startsWith("@")
        ? parts.slice(0, 2)
        : parts.slice(0, 1);
    if (specifier.startsWith("@") && (parts.length < 2 || !parts[1]))
        return undefined;
    const name = nameParts.join("/"),
        rest = parts.slice(nameParts.length);
    if (rest.some((segment) => segment === "." || segment === ".."))
        return undefined;
    return { name, subpath: rest.length ? "./" + rest.join("/") : "." };
}

export class NodeResolver {
    private packages = new Map<string, PackageJson | null>();
    constructor(
        readonly fs: NodeFileSystem,
        readonly extraConditions: readonly string[] = [],
    ) {}

    /** The package.json in this directory, if any. */
    packageAt(directory: string): PackageJson | undefined {
        const path = join(directory, "package.json");
        let cached = this.packages.get(path);
        if (cached === undefined) {
            const text = this.fs.read(path);
            cached = null;
            if (text !== undefined) {
                try {
                    const value = JSON.parse(text) as Record<string, unknown>;
                    if (value && typeof value === "object") {
                        cached = { path };
                        if (typeof value.name === "string")
                            cached.name = value.name;
                        if (typeof value.main === "string")
                            cached.main = value.main;
                        if (typeof value.type === "string")
                            cached.type = value.type;
                        if (value.exports !== undefined)
                            cached.exports = value.exports;
                        if (value.imports !== undefined)
                            cached.imports = value.imports;
                        if (value.bin !== undefined) cached.bin = value.bin;
                    }
                } catch {
                    throw new Error(`Invalid package configuration ${path}`);
                }
            }
            this.packages.set(path, cached);
        }
        return cached ?? undefined;
    }

    /** The nearest package.json at or above a file's directory (the package scope). */
    packageScope(path: string): PackageJson | undefined {
        let directory = dirname(path);
        for (;;) {
            if (directory.endsWith("/node_modules")) return undefined;
            const found = this.packageAt(directory);
            if (found) return found;
            const parent = dirname(directory);
            if (parent === directory) return undefined;
            directory = parent;
        }
    }

    private conditions(kind: ResolutionKind): string[] {
        return [...this.extraConditions, "nona", "node", kind, "default"];
    }

    /** The file a specifier names from the referrer, or undefined. Builtin specifiers are not handled here. */
    resolve(
        specifier: string,
        referrer: string,
        kind: ResolutionKind,
    ): string | undefined {
        let found: string | undefined;
        if (
            specifier.startsWith("./") ||
            specifier.startsWith("../") ||
            specifier === "." ||
            specifier === ".." ||
            specifier.startsWith("/")
        )
            found = this.loadFileOrDirectory(
                specifier.startsWith("/")
                    ? normalizePath(specifier)
                    : normalizePath(join(dirname(referrer), specifier)),
            );
        else if (specifier.startsWith("#"))
            found = this.resolveImports(specifier, referrer, kind);
        else found = this.resolvePackage(specifier, referrer, kind);
        return found === undefined ? undefined : this.real(found);
    }

    private real(path: string): string {
        try {
            return this.fs.realpath(path);
        } catch {
            return path;
        }
    }

    /**
     * The program a package directory builds into an executable: its "bin"
     * when it names one command (or one named after the package), otherwise
     * what `require(directory)` loads ("main", then index.js). Throws when
     * "bin" names several commands, none of them the package's own name.
     */
    packageEntry(directory: string): string | undefined {
        const pkg = this.packageAt(directory);
        let bin = pkg?.bin;
        if (bin !== null && typeof bin === "object") {
            const commands = bin as Record<string, unknown>,
                names = Object.keys(commands).filter(
                    (name) => typeof commands[name] === "string",
                );
            const own = pkg?.name?.split("/").pop();
            if (own !== undefined && typeof commands[own] === "string")
                bin = commands[own];
            else if (names.length === 1) bin = commands[names[0]!];
            else if (names.length > 1)
                throw new Error(
                    `${pkg!.path} names several commands in "bin" (${names.join(", ")}); build one of their files`,
                );
            else bin = undefined;
        }
        if (typeof bin === "string") {
            const found = this.loadFile(normalizePath(join(directory, bin)));
            if (found) return this.real(found);
        }
        const found = this.loadDirectory(directory);
        return found === undefined ? undefined : this.real(found);
    }

    /** LOAD_AS_FILE then LOAD_AS_DIRECTORY. */
    loadFileOrDirectory(path: string): string | undefined {
        return this.loadFile(path) ?? this.loadDirectory(path);
    }

    private loadFile(path: string): string | undefined {
        if (this.fs.isFile(path)) return path;
        for (const extension of [".js", ".json", ".mjs", ".cjs"])
            if (this.fs.isFile(path + extension)) return path + extension;
        return undefined;
    }

    private loadDirectory(path: string): string | undefined {
        if (!this.fs.isDirectory(path)) return undefined;
        const pkg = this.packageAt(path);
        if (pkg?.main) {
            const main = normalizePath(join(path, pkg.main));
            const found = this.loadFile(main) ?? this.loadIndex(main);
            if (found) return found;
        }
        return this.loadIndex(path);
    }

    private loadIndex(directory: string): string | undefined {
        for (const name of ["index.js", "index.json", "index.mjs", "index.cjs"])
            if (this.fs.isFile(join(directory, name)))
                return join(directory, name);
        return undefined;
    }

    private resolvePackage(
        specifier: string,
        referrer: string,
        kind: ResolutionKind,
    ): string | undefined {
        const parsed = parsePackageSpecifier(specifier);
        if (!parsed) return undefined;
        // Self-reference: the referrer's own package by name, through its exports.
        const scope = this.packageScope(referrer);
        if (scope && scope.name === parsed.name && scope.exports !== undefined)
            return this.resolveExports(
                dirname(scope.path),
                parsed.subpath,
                scope.exports,
                kind,
                scope.path,
            );
        let directory = dirname(referrer);
        for (;;) {
            if (!directory.endsWith("/node_modules")) {
                const packageDirectory = join(
                    join(directory, "node_modules"),
                    parsed.name,
                );
                if (this.fs.isDirectory(packageDirectory)) {
                    const pkg = this.packageAt(packageDirectory);
                    if (pkg?.exports !== undefined)
                        return this.resolveExports(
                            packageDirectory,
                            parsed.subpath,
                            pkg.exports,
                            kind,
                            pkg.path,
                        );
                    return parsed.subpath === "."
                        ? this.loadDirectory(packageDirectory)
                        : this.loadFileOrDirectory(
                              normalizePath(
                                  join(
                                      packageDirectory,
                                      parsed.subpath.slice(2),
                                  ),
                              ),
                          );
                }
            }
            const parent = dirname(directory);
            if (parent === directory) return undefined;
            directory = parent;
        }
    }

    private resolveImports(
        specifier: string,
        referrer: string,
        kind: ResolutionKind,
    ): string | undefined {
        if (specifier === "#" || specifier.startsWith("#/")) return undefined;
        const scope = this.packageScope(referrer);
        if (
            !scope ||
            scope.imports === null ||
            typeof scope.imports !== "object"
        )
            return undefined;
        return this.resolveMap(
            dirname(scope.path),
            specifier,
            scope.imports as Record<string, unknown>,
            kind,
            scope.path,
            true,
        );
    }

    /** PACKAGE_EXPORTS_RESOLVE. */
    private resolveExports(
        packageDirectory: string,
        subpath: string,
        exports: unknown,
        kind: ResolutionKind,
        configuration: string,
    ): string | undefined {
        // A string, an array or an object of conditions is the "." export alone.
        const conditionsOnly =
            typeof exports === "string" ||
            Array.isArray(exports) ||
            (exports !== null &&
                typeof exports === "object" &&
                Object.keys(exports).every((key) => !key.startsWith(".")));
        if (conditionsOnly)
            return subpath === "."
                ? this.resolveTarget(
                      packageDirectory,
                      exports,
                      "",
                      kind,
                      configuration,
                      false,
                  )
                : undefined;
        if (exports === null || typeof exports !== "object") return undefined;
        return this.resolveMap(
            packageDirectory,
            subpath,
            exports as Record<string, unknown>,
            kind,
            configuration,
            false,
        );
    }

    /** PACKAGE_IMPORTS_EXPORTS_RESOLVE: an exact key, else the longest matching `*` pattern. */
    private resolveMap(
        packageDirectory: string,
        key: string,
        map: Record<string, unknown>,
        kind: ResolutionKind,
        configuration: string,
        imports: boolean,
    ): string | undefined {
        if (Object.hasOwn(map, key) && !key.includes("*"))
            return this.resolveTarget(
                packageDirectory,
                map[key],
                "",
                kind,
                configuration,
                imports,
            );
        let best: string | undefined;
        for (const candidate of Object.keys(map)) {
            const star = candidate.indexOf("*");
            if (star < 0 || candidate.indexOf("*", star + 1) >= 0) continue;
            const base = candidate.slice(0, star),
                trailer = candidate.slice(star + 1);
            if (
                !key.startsWith(base) ||
                key === base ||
                key.length < candidate.length - 1 ||
                !key.endsWith(trailer)
            )
                continue;
            if (best === undefined || patternKeyCompare(best, candidate) > 0)
                best = candidate;
        }
        if (best === undefined) return undefined;
        const star = best.indexOf("*"),
            match = key.slice(star, key.length - (best.length - star - 1));
        return this.resolveTarget(
            packageDirectory,
            map[best],
            match,
            kind,
            configuration,
            imports,
        );
    }

    /** PACKAGE_TARGET_RESOLVE. */
    private resolveTarget(
        packageDirectory: string,
        target: unknown,
        match: string,
        kind: ResolutionKind,
        configuration: string,
        imports: boolean,
    ): string | undefined {
        if (typeof target === "string") {
            if (!target.startsWith("./")) {
                // Only `imports` may map to another package.
                if (
                    !imports ||
                    target.startsWith("../") ||
                    target.startsWith("/")
                )
                    return undefined;
                return this.resolvePackage(
                    target.split("*").join(match),
                    configuration,
                    kind,
                );
            }
            const segments = target.slice(2).split("/");
            if (
                segments.some(
                    (segment) =>
                        segment === ".." ||
                        segment === "." ||
                        segment.toLowerCase() === "node_modules",
                )
            )
                return undefined;
            const resolved = normalizePath(
                join(packageDirectory, target.split("*").join(match)),
            );
            // Exports name exact files (no extension probing), as in Node.
            return this.fs.isFile(resolved) ? resolved : undefined;
        }
        if (Array.isArray(target)) {
            for (const item of target) {
                const found = this.resolveTarget(
                    packageDirectory,
                    item,
                    match,
                    kind,
                    configuration,
                    imports,
                );
                if (found !== undefined) return found;
            }
            return undefined;
        }
        if (target !== null && typeof target === "object") {
            const conditions = this.conditions(kind);
            for (const [condition, value] of Object.entries(
                target as Record<string, unknown>,
            )) {
                if (!conditions.includes(condition)) continue;
                const found = this.resolveTarget(
                    packageDirectory,
                    value,
                    match,
                    kind,
                    configuration,
                    imports,
                );
                if (found !== undefined) return found;
            }
        }
        return undefined;
    }
}

/** PATTERN_KEY_COMPARE: a positive number when `b` is the more specific pattern. */
function patternKeyCompare(a: string, b: string): number {
    const aBase = a.indexOf("*"),
        bBase = b.indexOf("*");
    const aLength = aBase < 0 ? a.length : aBase + 1,
        bLength = bBase < 0 ? b.length : bBase + 1;
    if (aLength > bLength) return -1;
    if (bLength > aLength) return 1;
    if (aBase < 0) return 1;
    if (bBase < 0) return -1;
    if (a.length > b.length) return -1;
    if (b.length > a.length) return 1;
    return 0;
}
