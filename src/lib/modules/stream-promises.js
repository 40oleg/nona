import Stream from "node:stream";
const promises = Stream.promises;
export default promises;
export const finished = promises.finished,
    pipeline = promises.pipeline;
