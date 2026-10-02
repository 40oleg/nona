// The playground compiler: Nona's compile() running in a Web Worker.
// Bundled by scripts/build-playground.mjs into src/public/playground-worker.js.
import {compile} from '../../dist/src/compiler.js';

self.onmessage = ({data: {id, source, options}}) => {
  const start = performance.now();
  try {
    const result = compile(source, options);
    const ms = performance.now() - start;
    if (result.ok) {
      const image = result.image.slice();
      self.postMessage({id, ok: true, image, ms}, [image.buffer]);
    } else {
      const diagnostics = result.diagnostics.map(({code, message, span}) => ({code, message, start: span?.start ?? 0, end: span?.end ?? 0}));
      self.postMessage({id, ok: false, diagnostics, ms});
    }
  } catch (error) {
    self.postMessage({id, ok: false, error: String(error?.stack ?? error)});
  }
};
self.postMessage({ready: true});
