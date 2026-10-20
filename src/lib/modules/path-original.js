import {
    pathHost,
    pathInvalid,
    pathString,
    pathDrive,
    pathRoot,
    pathSegments,
    pathTail,
    pathCorePosix,
    pathCoreWin32,
} from "nona:internal/path-core";
function pathExtension(base) {
    const dot = base.lastIndexOf(".");
    return dot <= 0 || base === ".." ? "" : base.slice(dot);
}
function pathFlavor(windows) {
    const core = windows ? pathCoreWin32 : pathCorePosix,
        sep = core.sep,
        collapse = core.collapse,
        resolve = core.resolve,
        join = core.join,
        dirname = core.dirname;
    function normalize(text) {
        return collapse(text);
    }
    function basename(text, suffix) {
        if (suffix !== undefined) pathString(suffix, "suffix");
        pathString(text, "path");
        const start = windows && pathDrive(text) ? 2 : 0,
            tail = pathTail(text, windows, start),
            base = tail.base;
        if (!suffix) return base;
        if (text === suffix) return "";
        if (!base && suffix.length <= text.length) return text.slice(start);
        if (suffix.length < base.length && base.endsWith(suffix))
            return base.slice(0, -suffix.length);
        return base;
    }
    function extname(text) {
        pathString(text, "path");
        return pathExtension(
            pathTail(text, windows, windows && pathDrive(text) ? 2 : 0).base,
        );
    }
    function parse(text) {
        pathString(text, "path");
        const root = pathRoot(text, windows),
            tail = pathTail(text, windows, root.end);
        let ext = pathExtension(tail.base);
        if (!windows) {
            if (root.absolute) {
                if (tail.begin === 1) {
                    if (tail.base === "..") ext = ".";
                }
            }
        }
        let dir =
            tail.begin > root.end ? text.slice(0, tail.begin - 1) : root.root;
        return {
            root: root.root,
            dir: dir,
            base: tail.base,
            ext: ext,
            name: tail.base.slice(0, tail.base.length - ext.length),
        };
    }
    function format(object) {
        if (
            object === null ||
            typeof object !== "object" ||
            Array.isArray(object)
        )
            pathInvalid(object, "pathObject", "Object");
        const dir = object.dir || object.root,
            extension = object.ext;
        const base =
            object.base ||
            String(object.name || "") +
                (extension
                    ? (extension[0] === "." ? "" : ".") + String(extension)
                    : "");
        return dir
            ? String(dir) + (dir === object.root ? "" : sep) + base
            : base;
    }
    function relative(from, to) {
        pathString(from, "from");
        pathString(to, "to");
        if (from === to) return "";
        const a = resolve(from),
            b = resolve(to),
            ra = pathRoot(a, windows),
            rb = pathRoot(b, windows);
        const left = pathSegments(
                windows ? a : a.slice(ra.end),
                windows,
            ).filter((x) => x),
            right = pathSegments(windows ? b : b.slice(rb.end), windows).filter(
                (x) => x,
            );
        if (windows) {
            if (a.toLowerCase() === b.toLowerCase()) return "";
            const leftText = left.join(sep),
                rightText = right.join(sep),
                lowerLeft = leftText.toLowerCase(),
                lowerRight = rightText.toLowerCase();
            if (!left.length) return rightText;
            if (!right.length) return Array(left.length).fill("..").join(sep);
            let prefix = 0,
                boundary = -1;
            while (
                prefix < lowerLeft.length &&
                prefix < lowerRight.length &&
                lowerLeft[prefix] === lowerRight[prefix]
            ) {
                if (lowerLeft[prefix] === sep) boundary = prefix;
                prefix++;
            }
            if (
                prefix < lowerLeft.length &&
                prefix < lowerRight.length &&
                boundary < 0
            )
                return b;
            let rightStart = 0;
            while (b[rightStart] === sep) rightStart++;
            if (
                prefix === lowerLeft.length &&
                lowerLeft.length < lowerRight.length
            ) {
                if (rightText[prefix] === sep)
                    return b.slice(rightStart + prefix + 1);
                // A complete two-character prefix is treated as a Windows drive root,
                // including device-less paths resolved from a POSIX working directory.
                if (prefix === 2) return b.slice(rightStart + prefix);
            }
            if (
                prefix === lowerRight.length &&
                lowerRight.length < lowerLeft.length
            ) {
                if (leftText[prefix] === sep) boundary = prefix;
                else if (prefix === 2) boundary = 3;
            }
            const remaining =
                boundary + 1 <= leftText.length
                    ? pathSegments(leftText.slice(boundary + 1), true).length
                    : 0;
            const upward = Array(remaining).fill("..").join(sep),
                suffix = rightText.slice(Math.max(boundary, 0));
            return upward
                ? upward + suffix
                : suffix[0] === sep
                  ? suffix.slice(1)
                  : suffix;
        }
        let common = 0;
        while (
            common < left.length &&
            common < right.length &&
            left[common] === right[common]
        )
            common++;
        return Array(left.length - common)
            .fill("..")
            .concat(right.slice(common))
            .join(sep);
    }
    function isAbsolute(text) {
        pathString(text, "path");
        return pathRoot(text, windows).absolute;
    }
    function toNamespacedPath(text) {
        if (!windows || typeof text !== "string" || !text) return text;
        const resolved = resolve(text);
        if (resolved.length <= 2) return text;
        if (
            resolved.startsWith("\\\\") &&
            resolved[2] !== "?" &&
            resolved[2] !== "."
        )
            return "\\\\?\\UNC\\" + resolved.slice(2);
        if (pathDrive(resolved) && resolved[2] === "\\")
            return "\\\\?\\" + resolved;
        return resolved;
    }
    function matchesGlob(text, pattern) {
        pathString(text, "path");
        pathString(pattern, "pattern");
        return pathGlobMatch(text, pattern, windows);
    }
    return {
        resolve: resolve,
        normalize: normalize,
        isAbsolute: isAbsolute,
        join: join,
        relative: relative,
        toNamespacedPath: toNamespacedPath,
        dirname: dirname,
        basename: basename,
        extname: extname,
        format: format,
        parse: parse,
        matchesGlob: matchesGlob,
        sep: sep,
        delimiter: windows ? ";" : ":",
        win32: null,
        posix: null,
        _makeLong: toNamespacedPath,
    };
}
const posix = pathFlavor(false),
    win32 = pathFlavor(true);
posix.posix = win32.posix = posix;
posix.win32 = win32.win32 = win32;
const path = pathHost.platform === "win32" ? win32 : posix;
export default path;
export { posix, win32 };
export const resolve = path.resolve,
    normalize = path.normalize,
    isAbsolute = path.isAbsolute,
    join = path.join,
    relative = path.relative,
    toNamespacedPath = path.toNamespacedPath,
    dirname = path.dirname,
    basename = path.basename,
    extname = path.extname,
    format = path.format,
    parse = path.parse,
    matchesGlob = path.matchesGlob,
    sep = path.sep,
    delimiter = path.delimiter,
    _makeLong = path._makeLong;
