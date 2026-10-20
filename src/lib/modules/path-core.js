// The path primitives node:fs needs (resolve, join, dirname) and the helpers
// node:path builds its public API on. Served as nona:internal/path-core after
// the target's pathHost adapter (src/frontend/path-host.ts).
//
// Keep this source free of the names that select optional runtime parts (see
// preludeTriggers in src/link.ts and collectSourceUsage in the lexer): no
// RegExp, no Unicode property escapes, no normalization or Annex B names. A
// program that only reaches this module through node:fs then links none of
// them; tests/path-core-source.test.ts checks it.
function pathInvalid(value, name, type) {
    const received =
        value === null
            ? "null"
            : typeof value === "undefined"
              ? "undefined"
              : typeof value === "string"
                ? "type string ('" + value + "')"
                : typeof value === "object"
                  ? "an instance of " +
                    (Array.isArray(value) ? "Array" : "Object")
                  : typeof value === "function"
                    ? "type function"
                    : "type " + typeof value + " (" + String(value) + ")";
    const error = new TypeError(
        'The "' +
            name +
            '" argument must be of type ' +
            type +
            ". Received " +
            received,
    );
    error.code = "ERR_INVALID_ARG_TYPE";
    throw error;
}
function pathString(value, name) {
    if (typeof value !== "string") pathInvalid(value, name, "string");
}
function pathSeparator(text, index, windows) {
    return text[index] === "/" || (windows && text[index] === "\\");
}
function pathDrive(text) {
    const code = text.charCodeAt(0);
    return (
        text[1] === ":" &&
        ((code >= 65 && code <= 90) || (code >= 97 && code <= 122))
    );
}
function pathRoot(text, windows) {
    let end = 0,
        device = "",
        absolute = false;
    if (windows && pathDrive(text)) {
        device = text.slice(0, 2);
        end = 2;
        if (pathSeparator(text, 2, true)) {
            end = 3;
            absolute = true;
        }
    } else if (pathSeparator(text, 0, windows)) {
        end = 1;
        absolute = true;
        if (
            windows &&
            pathSeparator(text, 1, true) &&
            !pathSeparator(text, 2, true)
        ) {
            let serverEnd = 2;
            while (
                serverEnd < text.length &&
                !pathSeparator(text, serverEnd, true)
            )
                serverEnd++;
            let shareStart = serverEnd;
            while (
                shareStart < text.length &&
                pathSeparator(text, shareStart, true)
            )
                shareStart++;
            let shareEnd = shareStart;
            while (
                shareEnd < text.length &&
                !pathSeparator(text, shareEnd, true)
            )
                shareEnd++;
            if (serverEnd > 2 && shareEnd > shareStart) {
                device =
                    "\\\\" +
                    text.slice(2, serverEnd) +
                    "\\" +
                    text.slice(shareStart, shareEnd);
                end = shareEnd;
                if (pathSeparator(text, end, true)) end++;
            }
        }
    }
    return {
        device: device,
        absolute: absolute,
        end: end,
        root: text.slice(0, end),
    };
}
function pathSegments(text, windows) {
    const pieces = [];
    let start = 0;
    for (let i = 0; i <= text.length; i++)
        if (i === text.length || pathSeparator(text, i, windows)) {
            pieces.push(text.slice(start, i));
            start = i + 1;
        }
    return pieces;
}
function pathNavigationRoot(text, windows) {
    const root = pathRoot(text, windows);
    if (
        windows &&
        root.device &&
        pathSeparator(text, 0, true) &&
        pathSeparator(text, 1, true) &&
        (text[2] === "?" || text[2] === ".") &&
        pathSeparator(text, 3, true)
    )
        return {
            device: "\\\\" + text[2],
            absolute: true,
            end: 4,
            root: text.slice(0, 4),
        };
    return root;
}
function pathReduce(text, windows, above) {
    const stack = [];
    for (const part of pathSegments(text, windows)) {
        if (!part || part === ".") continue;
        if (part === "..") {
            if (stack.length && stack[stack.length - 1] !== "..") stack.pop();
            else if (above) stack.push(part);
        } else stack.push(part);
    }
    return stack.join(windows ? "\\" : "/");
}
function pathTail(text, windows, start) {
    let end = text.length;
    while (end > start && pathSeparator(text, end - 1, windows)) end--;
    let begin = end;
    while (begin > start && !pathSeparator(text, begin - 1, windows)) begin--;
    return { begin: begin, end: end, base: text.slice(begin, end) };
}
function pathReserved(text) {
    const colon = text.indexOf(":");
    if (colon < 0) return false;
    const name = text.slice(0, colon).toUpperCase();
    return [
        "CON",
        "PRN",
        "AUX",
        "NUL",
        "COM1",
        "COM2",
        "COM3",
        "COM4",
        "COM5",
        "COM6",
        "COM7",
        "COM8",
        "COM9",
        "LPT1",
        "LPT2",
        "LPT3",
        "LPT4",
        "LPT5",
        "LPT6",
        "LPT7",
        "LPT8",
        "LPT9",
        "COM¹",
        "COM²",
        "COM³",
        "LPT¹",
        "LPT²",
        "LPT³",
    ].includes(name);
}
/** The core operations of one flavor; collapse is the public path.normalize. */
function pathCoreFlavor(windows) {
    const sep = windows ? "\\" : "/";
    function collapse(text) {
        pathString(text, "path");
        if (!text) return ".";
        let root = pathNavigationRoot(text, windows);
        const trailing = pathSeparator(text, text.length - 1, windows);
        const reserved = windows && pathReserved(text);
        if (reserved) {
            let end = text.indexOf(":") + 1;
            while (pathSeparator(text, end, true)) end++;
            root = {
                device: text.slice(0, text.indexOf(":") + 1),
                absolute: false,
                end: end,
                root: "",
            };
        }
        let tail = pathReduce(text.slice(root.end), windows, !root.absolute);
        if (!tail && !root.absolute) tail = ".";
        if (tail && trailing) tail += sep;
        let result = root.device + (root.absolute ? sep : "") + tail;
        let colonSeparator = false;
        for (let i = 0; i < text.length; i++)
            if (
                text[i] === ":" &&
                (i === text.length - 1 || pathSeparator(text, i + 1, true))
            )
                colonSeparator = true;
        if (
            windows &&
            !root.absolute &&
            (reserved ||
                (!root.device && (pathDrive(result) || colonSeparator)))
        )
            result = "." + sep + result;
        return result;
    }
    function cwd() {
        let text = pathHost.cwd();
        if (!windows && pathHost.platform === "win32") {
            text = text.split("\\").join("/");
            text = text.slice(text.indexOf("/"));
        }
        return text;
    }
    function resolve(...args) {
        let device = "",
            absolute = false,
            tail = "";
        for (let i = args.length - 1; i >= -1; i--) {
            let text;
            if (i >= 0) {
                text = args[i];
                pathString(text, "paths[" + i + "]");
                if (!text) continue;
            } else {
                text = cwd();
                if (windows && device) {
                    const directory =
                        typeof pathHost.driveDirectory === "function"
                            ? pathHost.driveDirectory(device)
                            : pathHost.env["=" + device];
                    text = directory || text;
                    const current = pathRoot(text, true);
                    if (
                        current.device &&
                        current.device.toLowerCase() !== device.toLowerCase()
                    )
                        text = device + "\\";
                }
            }
            const root = pathNavigationRoot(text, windows);
            if (windows && root.device) {
                if (
                    device &&
                    root.device.toLowerCase() !== device.toLowerCase()
                )
                    continue;
                device = root.device;
            }
            if (!absolute) {
                tail = text.slice(root.end) + sep + tail;
                absolute = root.absolute;
            }
            if (absolute && (!windows || device)) break;
        }
        const reduced = pathReduce(tail, windows, !absolute);
        return device + (absolute ? sep : "") + reduced || ".";
    }
    function join(...args) {
        const pieces = [];
        for (let i = 0; i < args.length; i++) {
            pathString(args[i], "path");
            if (args[i]) pieces.push(args[i]);
        }
        if (!pieces.length) return ".";
        let text = pieces.join(sep);
        if (windows) {
            const first = pieces[0];
            const unc =
                pathSeparator(first, 0, true) &&
                pathSeparator(first, 1, true) &&
                first.length > 2 &&
                !pathSeparator(first, 2, true);
            if (!unc) {
                let count = 0;
                while (pathSeparator(text, count, true)) count++;
                if (count > 1) text = sep + text.slice(count);
            }
        }
        if (windows && text.split("\\").some((part) => pathReserved(part)))
            return text.split("/").join("\\");
        return collapse(text);
    }
    function dirname(text) {
        pathString(text, "path");
        if (!text) return ".";
        const root = pathRoot(text, windows),
            tail = pathTail(text, windows, root.end);
        if (tail.begin <= root.end) return root.root || ".";
        const end = tail.begin - 1;
        if (!windows && end === 1 && text[0] === "/") return "//";
        return text.slice(0, end) || root.root || ".";
    }
    return {
        sep: sep,
        collapse: collapse,
        resolve: resolve,
        join: join,
        dirname: dirname,
    };
}
const pathCorePosix = pathCoreFlavor(false),
    pathCoreWin32 = pathCoreFlavor(true),
    pathCoreHost = pathHost.platform === "win32" ? pathCoreWin32 : pathCorePosix;
export {
    pathHost,
    pathInvalid,
    pathString,
    pathDrive,
    pathRoot,
    pathSegments,
    pathTail,
    pathCorePosix,
    pathCoreWin32,
};
export const resolve = pathCoreHost.resolve,
    join = pathCoreHost.join,
    dirname = pathCoreHost.dirname;
