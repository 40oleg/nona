(function () {
    "use strict";
    var defineProperty = Object.defineProperty,
        markNative = Function.prototype.__nonaMarkNativeInternal;
    var TypeErrorConstructor = TypeError,
        fromCharCode = String.fromCharCode,
        hex = "0123456789abcdef";
    function install(object, name, length, fn) {
        defineProperty(fn, "name", { value: name, configurable: true });
        defineProperty(fn, "length", { value: length, configurable: true });
        markNative(fn);
        defineProperty(object, name, {
            value: fn,
            writable: true,
            enumerable: false,
            configurable: true,
        });
    }
    function hex2(code) {
        return "\\x" + hex[(code >> 4) & 15] + hex[code & 15];
    }
    function hex4(code) {
        return (
            "\\u" +
            hex[(code >> 12) & 15] +
            hex[(code >> 8) & 15] +
            hex[(code >> 4) & 15] +
            hex[code & 15]
        );
    }
    // The other punctuators, space and the WhiteSpace and LineTerminator
    // characters that have no control escape.
    function isEscapedOther(code) {
        switch (code) {
            case 0x2c:
            case 0x2d:
            case 0x3d:
            case 0x3c:
            case 0x3e:
            case 0x23:
            case 0x26:
            case 0x21:
            case 0x25:
            case 0x3a:
            case 0x3b:
            case 0x40:
            case 0x7e:
            case 0x27:
            case 0x60:
            case 0x22:
            case 0x20:
            case 0xa0:
            case 0xfeff:
            case 0x1680:
            case 0x202f:
            case 0x205f:
            case 0x3000:
            case 0x2028:
            case 0x2029:
                return true;
        }
        return code >= 0x2000 && code <= 0x200a;
    }
    // RegExp.escape ( S ) (ES2025 22.2.5.1).
    install(
        RegExp,
        "escape",
        1,
        {
            escape(S) {
                if (typeof S !== "string")
                    throw new TypeErrorConstructor(
                        "RegExp.escape requires a string",
                    );
                var length = S.length,
                    result = "";
                for (var i = 0; i < length; i++) {
                    var code = S.charCodeAt(i);
                    if (code >= 0xd800 && code <= 0xdbff && i + 1 < length) {
                        var next = S.charCodeAt(i + 1);
                        if (next >= 0xdc00 && next <= 0xdfff) {
                            // A valid pair passes through.
                            result += fromCharCode(code, next);
                            i++;
                            continue;
                        }
                    }
                    if (
                        i === 0 &&
                        ((code >= 0x30 && code <= 0x39) ||
                            (code >= 0x41 && code <= 0x5a) ||
                            (code >= 0x61 && code <= 0x7a))
                    )
                        result += hex2(code);
                    else if (
                        code === 0x5e ||
                        code === 0x24 ||
                        code === 0x5c ||
                        code === 0x2e ||
                        code === 0x2a ||
                        code === 0x2b ||
                        code === 0x3f ||
                        code === 0x28 ||
                        code === 0x29 ||
                        code === 0x5b ||
                        code === 0x5d ||
                        code === 0x7b ||
                        code === 0x7d ||
                        code === 0x7c ||
                        code === 0x2f
                    )
                        result += "\\" + fromCharCode(code);
                    else if (code === 9) result += "\\t";
                    else if (code === 10) result += "\\n";
                    else if (code === 11) result += "\\v";
                    else if (code === 12) result += "\\f";
                    else if (code === 13) result += "\\r";
                    else if (isEscapedOther(code))
                        result += code <= 0xff ? hex2(code) : hex4(code);
                    else if (code >= 0xd800 && code <= 0xdfff)
                        result += hex4(code);
                    else result += fromCharCode(code);
                }
                return result;
            },
        }.escape,
    );
})();
