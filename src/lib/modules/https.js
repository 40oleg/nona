// node:https without TLS: the module loads, Agent and globalAgent exist
// (packages such as HTTP clients pick an agent by protocol at load time), and
// everything that needs a TLS connection throws ERR_NONA_UNSUPPORTED.
import http from "node:http";

function unsupported(name) {
    return function () {
        const error = new Error(name + " is not supported by Nona");
        error.code = "ERR_NONA_UNSUPPORTED";
        throw error;
    };
}

export class Agent extends http.Agent {
    constructor(options) {
        super(options);
        this.defaultPort = 443;
        this.protocol = "https:";
    }
}
export let globalAgent = new Agent({ keepAlive: true, timeout: 5000 });
export const request = unsupported("https.request"),
    get = unsupported("https.get"),
    createServer = unsupported("https.createServer");
export class Server {
    constructor() {
        unsupported("https.Server")();
    }
}
export default {
    Agent,
    get globalAgent() {
        return globalAgent;
    },
    set globalAgent(value) {
        globalAgent = value;
    },
    Server,
    createServer,
    get,
    request,
};
