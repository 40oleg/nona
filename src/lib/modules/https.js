import * as http from "node:http";
import * as net from "node:net";
import * as tls from "node:tls";

// node:https (issue #301): the HTTP/1.1 client of node:http over TLS sockets
// of node:tls. An https.Agent pools TLS connections like http.Agent pools TCP
// ones (keep-alive included); its pool key also holds the TLS options that
// make two connections differ. The server side (https.createServer) is not
// implemented.

const tlsKeyOptions = [
    "ca",
    "cert",
    "ciphers",
    "key",
    "pfx",
    "passphrase",
    "rejectUnauthorized",
    "servername",
    "minVersion",
    "maxVersion",
    "ALPNProtocols",
    "checkServerIdentity",
];

export class Agent extends http.Agent {
    constructor(options) {
        super(options);
        this.defaultPort = 443;
        this.protocol = "https:";
        this.maxCachedSessions = this.options.maxCachedSessions;
        if (this.maxCachedSessions === undefined) this.maxCachedSessions = 100;
    }
    createConnection(options, callback) {
        options = Object.assign({}, options);
        delete options.path;
        if (!options.servername && options.servername !== "") {
            const host = options.host || options.hostname || "localhost";
            if (!net.isIP(host)) options.servername = host;
        }
        const socket = tls.connect(options);
        if (callback)
            socket.once("secureConnect", () => callback(null, socket));
        return socket;
    }
    getName(options) {
        options = options || {};
        let name = super.getName(options);
        for (const key of tlsKeyOptions) {
            name += ":";
            const value = options[key];
            if (value === undefined || value === null) continue;
            if (typeof value === "function") {
                name += "fn";
                if (key === "checkServerIdentity")
                    name += "#" + identityId(value);
            } else if (Array.isArray(value))
                name += value.map(String).join(",");
            else name += String(value);
        }
        return name;
    }
}

const functionIds = new WeakMap();
let nextFunctionId = 0;
function identityId(fn) {
    let id = functionIds.get(fn);
    if (id === undefined) functionIds.set(fn, (id = ++nextFunctionId));
    return id;
}

export let globalAgent = new Agent({
    keepAlive: true,
    scheduling: "lifo",
    timeout: 5000,
});

/** Arguments of request/get with the https default agent filled in. */
function withDefaults(url, options, callback) {
    if (typeof options === "function") {
        callback = options;
        options = undefined;
    }
    const isUrl =
        typeof url === "string" ||
        (url !== null &&
            typeof url === "object" &&
            typeof url.href === "string" &&
            typeof url.hostname === "string");
    if (isUrl)
        return [
            url,
            Object.assign({}, options, { _defaultAgent: globalAgent }),
            callback,
        ];
    return [Object.assign({}, url, { _defaultAgent: globalAgent }), callback];
}
export function request(url, options, callback) {
    return http.request(...withDefaults(url, options, callback));
}
export function get(url, options, callback) {
    const req = request(url, options, callback);
    req.end();
    return req;
}

function unsupported() {
    const error = new Error(
        "https.createServer is not supported by Nona yet (only the https client is)",
    );
    error.code = "ERR_FEATURE_UNAVAILABLE_ON_PLATFORM";
    return error;
}
export function createServer() {
    throw unsupported();
}
export class Server {
    constructor() {
        throw unsupported();
    }
}

export default {
    Agent,
    Server,
    createServer,
    get,
    request,
    get globalAgent() {
        return globalAgent;
    },
    set globalAgent(value) {
        globalAgent = value;
    },
};
