import { request } from "undici";
const response = await request(process.env.NONA_PROBE_HTTP + "/data");
console.log("client", response.statusCode, (await response.body.json()).value);
