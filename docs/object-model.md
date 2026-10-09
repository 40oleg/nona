# Object model

How the runtime stores objects and their named properties. Source:
`src/runtime/object-layout.ts`, `src/runtime/shapes.ts`,
`src/runtime/named-properties.ts`, `src/runtime/property-cache.ts`.

## Object header

Every object is a heap block (`HeapLayout`, 40 bytes: next, bytes, kind,
mark, grey link) whose payload starts with a 72-byte header:

| Offset | Field | Contents |
| --- | --- | --- |
| 0 | `kind` | 0 plain object, 1 array, 2 function, … (`*Kind` constants) |
| 8 | `properties` | the property list (dictionary mode), or 0 |
| 16 | `length` | array length |
| 24 | `prototype` | the prototype object, or 0 |
| 32 | `shape` | the object's shape (shaped mode), or 0 |
| 40 | `flags` | `ObjectFlags`: non-extensible, readonly length, cached prototype, stringifying, … |
| 48 | `index` | hash index of a long property list (`property-index.ts`), or 0 |
| 56 | `elements` | dense array elements (`array-elements.ts`), or 0 |
| 64 | `keys` | dictionary mode: a filter of the own keys; shaped mode: the out-of-line slots, or 0 |

Kinds with more state (functions, maps, typed arrays, …) put their fields
after the header (`FunctionLayout`, `MapLayout`, … start at `ObjectLayout.size`).

## Named properties: two representations

**Shaped objects** (plain objects made by object literals, by `new` with an
ordinary constructor and by `JSON.parse`): the values of the named properties are 16-byte
slots, the first `capacity` inline after the header, the rest in a value list
in `keys`. The *shape* says which key is in which slot. A five-property object
is 40 + 72 + 5 × 16 = 192 bytes.

**Dictionary objects** (everything else, and any shaped object that needed
more): a linked list of 72-byte property nodes (`PropertyLayout`: next, key,
value, attributes, getter, setter), newest first, with a hash index once the
list is long.

Every property of a shaped object is an ordinary data property (writable,
enumerable, configurable) whose key is a string that is not an array index
and not `__proto__`. Elements are stored separately in both modes.

## Shapes

A shape is an immutable record: parent, key, property count (the slot of the
key is `count - 1`), inline capacity, root, the transitions to its children
(a list, hashed once there are more than eight) and, on a root, a successor.
Objects that start from the same root and get the same keys in the same
order have the same shape. Shapes are never freed. They are allocated outside the
collected heap, so they do not count as live heap bytes, and the collector
only marks their keys.

- Object literals share one root per inline capacity (the literal's property
  count; 4 for `{}`).
- An object literal whose keys are all known at compile time (data properties
  and methods with identifier, string or name-like keys; no spread, computed
  key, accessor, `__proto__` or array-index key) has a per-site record
  (`LiteralSiteLayout`, in `.data`) with its keys in order. Its first
  evaluation resolves the shape the keys lead to from the literal root
  (`rt.literalSiteResolve`); every evaluation allocates the object with that
  shape (`rt.newLiteralObject`, slots undefined) and each definition stores its
  value into its slot directly, without a transition lookup. The shape is the
  one the key-by-key definitions would give, so these objects share shapes
  and inline caches with objects built by assignments. When the shape cannot
  be resolved (too many shapes or transitions), the site falls back to
  ordinary definitions. A definition also falls back when the object no longer
  has the site's shape.
- Every constructor has its own root (`FunctionLayout.instanceShape`). When an
  instance outgrows the inline slots, the root gets a successor with as many
  slots as that instance now has properties, and later instances start from
  it.
- A shape has at most 128 properties; a program has at most 2^20 shapes.

## Leaving shaped mode

`rt.shapeMaterialize` turns a shaped object into a dictionary object with the
same properties in the same order. It happens when an object needs something a
shape cannot describe: an accessor, other attributes, `delete`, a symbol or
array-index key, `Object.freeze`/`seal`, more than 128 properties, or a
generic runtime path that works on property nodes. Nothing turns a dictionary
object back into a shaped one.

The functions that read the property list, the property index or the key
filter of an object (`findOwnProperty`, `ownNamedNode`, `defineOwnProperty`,
`deleteProperty`, `setPropertySlow`, the element helpers, …) start with
`emitShapeGuard`, which materializes a shaped object. The common paths
understand shapes directly and keep objects shaped: named reads and writes
(`namedGetFast`, `namedSetFast`), the inline caches, `in`, `hasOwnProperty`,
`propertyIsEnumerable`, `Object.keys`, own-key enumeration (`for-in`,
`Object.entries`/`values`, spread) and the collector.

## Inline caches

Every `object.name` read and `object.name = value` write whose name is a
plain name has a record in the data section.

- Reads (`PropertyCacheLayout`): two entries of (shape, slot, byte offset)
  for shaped receivers - slot -1 records that the key is not own - and four
  (prototype, node) entries for inherited properties, valid for one *shape
  epoch*. Every site calls `rt.icGet`, a short hit path: the first shape
  entry's inline slot, or a method found through the first prototype entry.
  Everything else goes on to `rt.getPropertyCached`.
- Writes (`SetCacheLayout`): (shape, slot, byte offset) for an existing
  property, written by `rt.icSet`, and a transition (from, to, prototype,
  epoch) for a property the write adds, in `rt.setPropertyCached`.
- `'name' in object` with a literal plain name and `hasOwnProperty` calls
  (`object.hasOwnProperty(key)`, `f.call(object, key)`) have a record of two
  entries (`HasCacheLayout` in `src/runtime/has-cache.ts`), valid for one
  shape epoch. For `in` an entry is (shape, prototype, answer): a hit needs a
  shaped receiver with that shape and prototype. A miss asks
  `rt.hasProperty` and fills the entry only when the answer comes from the
  shape, or from a chain of ordinary objects, arrays and functions (not the
  global object), which it flags like a read cache. For `hasOwnProperty` an
  entry is (shape, key record, answer); the generated code first checks that
  the callee is %Object.prototype.hasOwnProperty% (or `call` with it as the
  receiver), and keys that may be array indices take the call.

The hit paths are shared functions rather than code at every site: inlining
them made executables 12–16% larger (hello world from 1.9 to 2.2 MB) for no
measurable speed-up over a call.

The shape epoch (`rt.shapeEpoch`) advances when a property is added to,
removed from or redefined on an object that some cache uses as a prototype,
when such an object's prototype changes, and at every collection.

## Development aids

`NONA_SHAPE_STATS=1` at compile time adds a counter to every place that
materializes a shaped object and to every reason a transition fails
(`dbg.guard.*` symbols). Read them at exit, for example with gdb and the
symbol map from `NONA_ELF_MAP`.
