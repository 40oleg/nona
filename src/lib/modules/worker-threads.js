
function unsupported(name) {
  return function () {
    const error = new Error(name + ' is not supported by Nona');
    error.code = 'ERR_NONA_UNSUPPORTED';
    throw error;
  };
}

export const isMainThread = true, parentPort = null, workerData = null, threadId = 0, resourceLimits = {};
export const Worker = unsupported('worker_threads.Worker');
export const MessageChannel = globalThis.MessageChannel, MessagePort = globalThis.MessagePort, BroadcastChannel = globalThis.BroadcastChannel;
export function markAsUntransferable() {}
export function getEnvironmentData() { return undefined; }
export function setEnvironmentData() {}
export default {isMainThread, parentPort, workerData, threadId, resourceLimits, Worker, MessageChannel, MessagePort, BroadcastChannel, markAsUntransferable, getEnvironmentData, setEnvironmentData};
