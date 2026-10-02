// The compiler only resolves the entry file name to a '/'-rooted path.
export function resolve(path) {
  return path.startsWith('/') ? path : '/' + path;
}
export default {resolve};
