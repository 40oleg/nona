// compiler.ts reads process.platform for its default target and the ELF
// writer reads process.env; the playground always passes a target.
export const process = {platform: 'linux', arch: 'x64', env: {}, argv: []};
