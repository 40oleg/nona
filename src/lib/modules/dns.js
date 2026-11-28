import { _internal, isIP } from "node:net";

function argumentError(code, message) {
    const error = new TypeError(message);
    error.code = code;
    return error;
}

function notFound(hostname) {
    const error = new Error("getaddrinfo ENOTFOUND " + hostname);
    error.code = "ENOTFOUND";
    error.errno = -3008;
    error.syscall = "getaddrinfo";
    error.hostname = hostname;
    return error;
}

/** Callback lookup over net's synchronous, IPv4 hostname resolver. */
export function lookup(hostname, options, callback) {
    if (typeof options === "function") {
        callback = options;
        options = undefined;
    }
    // Validate before scheduling or resolving; resolution errors use callbacks.
    if (typeof callback !== "function")
        throw argumentError("ERR_INVALID_ARG_TYPE", "callback must be a function");
    if (typeof hostname !== "string" || hostname.length === 0)
        throw argumentError("ERR_INVALID_ARG_VALUE", "hostname must be a non-empty string");
    let family = 0;
    let all = false;
    if (typeof options === "number") family = options;
    else if (options !== undefined) {
        if (options === null || typeof options !== "object")
            throw argumentError("ERR_INVALID_ARG_TYPE", "options must be a number or object");
        for (const key of Object.keys(options))
            if (key !== "family" && key !== "all")
                throw argumentError("ERR_INVALID_ARG_VALUE", "unsupported dns.lookup option: " + key);
        if (options.family !== undefined) family = options.family;
        if (options.all !== undefined) {
            if (typeof options.all !== "boolean")
                throw argumentError("ERR_INVALID_ARG_TYPE", "options.all must be a boolean");
            all = options.all;
        }
    }
    if (family !== 0 && family !== 4 && family !== 6)
        throw argumentError("ERR_INVALID_ARG_VALUE", "family must be 0, 4 or 6");

    _internal.defer(() => {
        let addresses;
        let error = null;
        try {
            if (hostname.indexOf("\0") >= 0) throw notFound(hostname);
            addresses = _internal.lookup(hostname);
            // Like Node, IP literals bypass the requested family filter.
            if (family !== 0 && !isIP(hostname))
                addresses = addresses.filter((entry) => entry.family === family);
            if (addresses.length === 0) throw notFound(hostname);
        } catch (failure) {
            error = failure;
        }
        // User code is outside the resolution catch: a thrown callback must
        // propagate, never trigger a second callback with its own exception.
        if (error !== null) callback(error);
        else if (all) callback(null, addresses);
        else callback(null, addresses[0].address, addresses[0].family);
    });
}

export default { lookup };
