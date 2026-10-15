const cache = Object.create(null);
let mainModule;

function invalidArgument(name, value) {
    const error = new TypeError(
        'The "' +
            name +
            '" argument must be of type string. Received ' +
            (value === null
                ? "null"
                : typeof value === "object" || typeof value === "function"
                  ? "an instance of " +
                    ((value.constructor && value.constructor.name) || "Object")
                  : "type " + typeof value + " (" + String(value) + ")"),
    );
    error.code = "ERR_INVALID_ARG_TYPE";
    return error;
}

function notFound(id, module) {
    const stack = [];
    for (let current = module; current; current = current.parent)
        stack.push(current.filename);
    const error = new Error(
        "Cannot find module '" +
            id +
            "'\nRequire stack:\n- " +
            stack.join("\n- "),
    );
    error.code = "MODULE_NOT_FOUND";
    error.requireStack = stack;
    return error;
}

// Every CommonJS file of the program by file name: factory records are all
// defined before the program's own code runs (see src/frontend/commonjs.ts).
const records = new Map();

export function define(filename, dirname, factory, table) {
    const record = { filename, dirname, factory, table };
    if (!records.has(filename)) records.set(filename, record);
    return record;
}

function makeRequire(record, module) {
    const require = function require(id) {
        if (typeof id !== "string") throw invalidArgument("id", id);
        if (id === "") {
            const error = new TypeError(
                "The argument 'id' must be a non-empty string. Received ''",
            );
            error.code = "ERR_INVALID_ARG_VALUE";
            throw error;
        }
        const entry = record.table.get(id);
        if (entry === undefined || entry[1] === undefined)
            throw notFound(id, module);
        const target = entry[1]();
        if (entry[2] === 0) return load(target, module);
        // A builtin module's require() value is its default export (fs, events, path ...).
        if (entry[2] === 2 && "default" in target) return target.default;
        return target;
    };
    require.resolve = function resolve(id) {
        if (typeof id !== "string") throw invalidArgument("request", id);
        const entry = record.table.get(id);
        if (entry === undefined) throw notFound(id, module);
        return entry[0];
    };
    require.resolve.paths = function paths(id) {
        return null;
    };
    require.cache = cache;
    require.main = mainModule;
    require.extensions = Object.create(null);
    return require;
}

function load(record, parent, main) {
    const cached = cache[record.filename];
    if (cached !== undefined) {
        if (parent && !parent.children.includes(cached))
            parent.children.push(cached);
        return cached.exports;
    }
    const module = {
        id: main ? "." : record.filename,
        path: record.dirname,
        exports: {},
        filename: record.filename,
        loaded: false,
        children: [],
        paths: [],
        parent: parent || null,
    };
    if (main) mainModule = module;
    if (parent) parent.children.push(module);
    cache[record.filename] = module;
    const require = makeRequire(record, module);
    module.require = require;
    try {
        record.factory.call(
            module.exports,
            module.exports,
            require,
            module,
            record.filename,
            record.dirname,
            globalThis,
        );
    } catch (error) {
        // A module that fails is forgotten, as in Node: a later require runs it again.
        delete cache[record.filename];
        if (parent) {
            const index = parent.children.indexOf(module);
            if (index >= 0) parent.children.splice(index, 1);
        }
        throw error;
    }
    module.loaded = true;
    return module.exports;
}

/** An import of a CommonJS file: its module.exports. */
export function importDefault(record) {
    return load(record, null, false);
}

/** The program's entry when it is a CommonJS file. */
export function runMain(record) {
    load(record, null, true);
}

const windowsPath = (path) => /^[A-Za-z]:[\\/]/.test(path);
const relative = (id) => /^\.\.?([\\/]|$)/.test(id);
const isAbsolute = (path) => path.startsWith("/") || windowsPath(path);

/** path resolved against directory, with . and .. removed, in the directory's style. */
function resolvePath(directory, path) {
    const windows = windowsPath(directory);
    const separator = windows ? "\\" : "/";
    let root, rest;
    if (isAbsolute(path)) {
        root = windowsPath(path) ? path.slice(0, 3) : "/";
        rest = path.slice(root.length);
    } else {
        root = windows ? directory.slice(0, 3) : "/";
        rest = directory.slice(root.length) + "/" + path;
    }
    const parts = [];
    for (const part of rest.split(windows ? /[\\/]/ : "/")) {
        if (part === "" || part === ".") continue;
        if (part === "..") parts.pop();
        else parts.push(part);
    }
    return root.replace("/", separator) + parts.join(separator);
}

function fileUrlPath(url) {
    let path = decodeURIComponent(url.slice("file://".length).replace(/^[^/]*/, ""));
    if (/^\/[A-Za-z]:/.test(path)) path = path.slice(1).split("/").join("\\");
    return path;
}

/** Entries of every require table of the program: by resolved file name, and builtins and packages by specifier. */
function programModules() {
    const byName = new Map(),
        bySpecifier = new Map();
    for (const record of records.values()) {
        byName.set(record.filename, [record.filename, () => record, 0]);
        if (!record.table) continue;
        for (const [specifier, entry] of record.table) {
            if (entry[1] === undefined) continue;
            if (entry[2] !== 2 && !byName.has(entry[0]))
                byName.set(entry[0], entry);
            if (!relative(specifier) && !isAbsolute(specifier)) {
                if (!bySpecifier.has(specifier))
                    bySpecifier.set(specifier, entry);
                if (entry[2] === 2) {
                    const other = specifier.startsWith("node:")
                        ? specifier.slice(5)
                        : "node:" + specifier;
                    if (!bySpecifier.has(other)) bySpecifier.set(other, entry);
                }
            }
        }
    }
    return { byName, bySpecifier };
}

/**
 * module.createRequire: a require function for a file. Modules are resolved
 * when the program is compiled, so it finds only what the program contains:
 * its CommonJS files, and the modules and builtins that some CommonJS file of
 * the program requires. Anything else throws MODULE_NOT_FOUND, as a
 * require(variable) does.
 */
export function createRequire(filename) {
    let path = filename;
    if (path !== null && typeof path === "object" && typeof path.href === "string" && path.protocol === "file:")
        path = path.href;
    if (typeof path === "string" && path.startsWith("file:"))
        path = fileUrlPath(path);
    else if (typeof path !== "string" || !isAbsolute(path)) {
        const error = new TypeError(
            "The argument 'filename' must be a file URL object, file URL string, or absolute path string. Received " +
                (typeof filename === "string"
                    ? "'" + filename + "'"
                    : String(filename)),
        );
        error.code = "ERR_INVALID_ARG_VALUE";
        throw error;
    }
    const directory = /[\\/]$/.test(path)
        ? path
        : resolvePath(path, "..");
    const table = {
        get(id) {
            const { byName, bySpecifier } = programModules();
            if (!relative(id) && !isAbsolute(id))
                return bySpecifier.get(id);
            const base = resolvePath(directory, id),
                separator = windowsPath(base) ? "\\" : "/";
            for (const suffix of ["", ".js", ".json", ".cjs", ".mjs", separator + "index.js", separator + "index.json"]) {
                const entry = byName.get(base + suffix);
                if (entry !== undefined) return entry;
            }
            return undefined;
        },
    };
    const module = {
        id: path,
        filename: path,
        exports: {},
        loaded: false,
        children: [],
        paths: [],
        parent: null,
    };
    return makeRequire({ filename: path, dirname: directory, table }, module);
}
