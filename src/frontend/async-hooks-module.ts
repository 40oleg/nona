/** The public manual resource API uses the shared runtime context. */
export const asyncHooksModuleSource=String.raw`
const api=EventTarget[Symbol.for('nona.async_hooks.internal')];
export const AsyncResource=api.AsyncResource,AsyncLocalStorage=api.AsyncLocalStorage;
export const executionAsyncId=api.executionAsyncId,triggerAsyncId=api.triggerAsyncId,executionAsyncResource=api.executionAsyncResource,createHook=api.createHook;
export default {AsyncResource,AsyncLocalStorage,executionAsyncId,triggerAsyncId,executionAsyncResource,createHook};
`;
