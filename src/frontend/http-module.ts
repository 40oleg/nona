import { modulesHttp } from "../lib/sources.generated.js";
/**
 * Source of the built-in `node:http` (alias `nona:http`) module: Nona's own
 * HTTP/1.1 server and client behind the Node.js API.
 *
 * The design follows from what costs time in Nona: a generic JavaScript
 * step costs far more than in a JIT, while native runtime code and system
 * calls are cheap. So request bytes never go through JavaScript loops:
 *
 * - The server reads straight from the socket's read buffer (no chunk object
 *   per read) and parses request heads with a native parser
 *   (nona:internal/native) that returns offsets. A request keeps a copy of
 *   its head bytes; the method comes from a table, the URL is one native
 *   slice, and header strings are only made when the program asks for them.
 * - A response head is one string built from cached pieces (status line,
 *   Date, connection fields); head and body are encoded natively into one
 *   output buffer and written with a single system call.
 * - Events nobody listens to are not scheduled. Work that Node.js defers per
 *   request (finish, close, discarding an unread request) runs in one job
 *   per batch of requests.
 *
 * What programs observe (headers and their order, duplicate merging, events,
 * keep-alive and pipelining, errors) matches Node.js; tests/http.test.ts
 * runs the same programs under Node.js and compares the output.
 */
export const httpModuleSource = modulesHttp;
