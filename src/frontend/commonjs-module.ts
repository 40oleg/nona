/**
 * `nona:internal/commonjs`: the CommonJS loader the compiled program runs
 * (see src/frontend/commonjs.ts for how module records use it).
 *
 * A factory record's default export is a *record* made by `define`: the
 * module wrapper, the file names and the require table, whose entries are
 * `[resolved file name, getter, kind]` with kind 0 for a CommonJS record,
 * 1 for an ES module namespace and 2 for a builtin module namespace. Nothing
 * of the file runs until the record is loaded: by `require`, by an `import`
 * of the file (its facade calls `importDefault`) or as the main module.
 *
 * `require.cache` is keyed by file name as in Node: a module runs once,
 * deleting its entry makes the next `require` run it again, and a module that
 * throws while it runs is removed so that a later `require` retries it.
 */
export const commonJsModuleSource=String.raw`
const cache = Object.create(null);
let mainModule;

function invalidArgument(name, value) {
  const error = new TypeError('The "' + name + '" argument must be of type string. Received ' + (value === null ? 'null' : typeof value === 'object' || typeof value === 'function' ? 'an instance of ' + (value.constructor && value.constructor.name || 'Object') : 'type ' + typeof value + ' (' + String(value) + ')'));
  error.code = 'ERR_INVALID_ARG_TYPE';
  return error;
}

function notFound(id, module) {
  const stack = [];
  for (let current = module; current; current = current.parent) stack.push(current.filename);
  const error = new Error("Cannot find module '" + id + "'\nRequire stack:\n- " + stack.join('\n- '));
  error.code = 'MODULE_NOT_FOUND';
  error.requireStack = stack;
  return error;
}

export function define(filename, dirname, factory, table) {
  return {filename, dirname, factory, table};
}

function makeRequire(record, module) {
  const require = function require(id) {
    if (typeof id !== 'string') throw invalidArgument('id', id);
    if (id === '') {
      const error = new TypeError("The argument 'id' must be a non-empty string. Received ''");
      error.code = 'ERR_INVALID_ARG_VALUE';
      throw error;
    }
    const entry = record.table.get(id);
    if (entry === undefined || entry[1] === undefined) throw notFound(id, module);
    const target = entry[1]();
    if (entry[2] === 0) return load(target, module);
    // A builtin module's require() value is its default export (fs, events, path ...).
    if (entry[2] === 2 && 'default' in target) return target.default;
    return target;
  };
  require.resolve = function resolve(id) {
    if (typeof id !== 'string') throw invalidArgument('request', id);
    const entry = record.table.get(id);
    if (entry === undefined) throw notFound(id, module);
    return entry[0];
  };
  require.resolve.paths = function paths(id) { return null; };
  require.cache = cache;
  require.main = mainModule;
  require.extensions = Object.create(null);
  return require;
}

function load(record, parent, main) {
  const cached = cache[record.filename];
  if (cached !== undefined) {
    if (parent && !parent.children.includes(cached)) parent.children.push(cached);
    return cached.exports;
  }
  const module = {id: main ? '.' : record.filename, path: record.dirname, exports: {}, filename: record.filename, loaded: false, children: [], paths: [], parent: parent || null};
  if (main) mainModule = module;
  if (parent) parent.children.push(module);
  cache[record.filename] = module;
  const require = makeRequire(record, module);
  module.require = require;
  try {
    record.factory.call(module.exports, module.exports, require, module, record.filename, record.dirname, globalThis);
  } catch (error) {
    // A module that fails is forgotten, as in Node: a later require runs it again.
    delete cache[record.filename];
    if (parent) {
      const index = parent.children.indexOf(module);
      if (index >= 0) parent.children.splice(index, 1);
    }
    throw error;
  }
  module.loaded = true;
  return module.exports;
}

/** An import of a CommonJS file: its module.exports. */
export function importDefault(record) {
  return load(record, null, false);
}

/** The program's entry when it is a CommonJS file. */
export function runMain(record) {
  load(record, null, true);
}
`;
