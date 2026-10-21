# Object model

How the runtime stores objects and their named properties. Source:
`src/runtime/object-layout.ts`, `src/runtime/shapes.ts`,
`src/runtime/named-properties.ts`, `src/runtime/property-cache.ts`.

## Object header

Every object is a heap block (`HeapLayout`, 40 bytes: next, bytes, kind,
mark, grey link) whose payload starts with a 72-byte header:

| Offset | Field        | Contents                                                                            |
| ------ | ------------ | ----------------------------------------------------------------------------------- |
| 0      | `kind`       | 0 plain object, 1 array, 2 function, … (`*Kind` constants)                          |
| 8      | `properties` | the property list (dictionary mode), or 0                                           |
| 16     | `length`     | array length                                                                        |
| 24     | `prototype`  | the prototype object, or 0                                                          |
| 32     | `shape`      | the object's shape (shaped mode), or 0                                              |
| 40     | `flags`      | `ObjectFlags`: non-extensible, readonly length, cached prototype, stringifying, …   |
| 48     | `index`      | hash index of a long property list (`property-index.ts`), or 0                      |
| 56     | `elements`   | dense array elements (`array-elements.ts`), or 0                                    |
| 64     | `keys`       | dictionary mode: a filter of the own keys; shaped mode: the out-of-line slots, or 0 |

Kinds with more state (functions, maps, typed arrays, …) put their fields
after the header (`FunctionLayout`, `MapLayout`, … start at `ObjectLayout.size`).

## Named properties: two representations

**Shaped objects** (plain objects made by object literals, by `new` with an
ordinary constructor and by `JSON.parse`): the values of the named properties are 16-byte
slots, the first `capacity` inline after the header, the rest in a value list
in `keys`. The _shape_ says which key is in which slot. A five-property object
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
  (`rt.literalSiteResolve`). A literal without methods evaluates its values
  first (not observable) and, once its site is resolved, the generated code
  allocates the object with the site's constant cell size (`rt.allocRaw`) and
  writes the header, every value into its slot and undefined into the spare
  slots in one pass, with nothing in between that could reach a collection.
  A literal with methods (whose home object must exist first) allocates the
  object with that shape (`rt.newLiteralObject`, slots undefined) and each
  definition stores its value into its slot directly, without a transition
  lookup. The shape is the
  one the key-by-key definitions would give, so these objects share shapes
  and inline caches with objects built by assignments. When the shape cannot
  be resolved (too many shapes or transitions), the site falls back to
  ordinary definitions. A definition also falls back when the object no longer
  has the site's shape.
- An array literal without holes or spread (at most 4096 elements) is
  created by `rt.newArrayLiteral` with its element table (a power of two of
  at least four slots, the elements undefined), and each element is stored
  into its slot by the generated code, instead of a table built and grown by
  `rt.setProperty` definitions. A table of up to eight slots is part of the
  array's own cell, right after the header (`inlineElementCapacity`): one
  managed allocation instead of a cell and a raw-heap table, and nothing to
  release when the array dies. An object whose `elements` is its payload +
  `ObjectLayout.size` owns such a table; growing the array moves the elements
  to a raw-heap table. An array literal of up to eight elements evaluates its
  elements first and is written by the generated code in one pass, header,
  table and elements, into one `rt.allocRaw` cell.
- `rt.newShapedObject` (object literals and constructor instances) takes an
  uncleared cell (`rt.allocRaw`) and writes every header field and inline
  slot itself.
- Every constructor has its own root (`FunctionLayout.instanceShape`). When an
  instance outgrows the inline slots, the root gets a successor with as many
  slots as that instance now has properties, and later instances start from
  it.
- A `new C(...)` site has a record (`NewCacheLayout`): the constructor and
  the node of its own `prototype` data property at the shape epoch.
  `rt.newInstanceCached` then creates the instance from the constructor's
  root and sets its prototype from the node without a lookup; `prototype` is
  never configurable, and the constructor is flagged so that redefining it
  advances the epoch. `%Promise%` is never remembered (its executor is
  checked first).
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

`s.charCodeAt(i)` and `s.charAt(i)` on a primitive string do not use these caches: the call site checks inline that the callee is still the intrinsic `String.prototype` method (a function identity check, not a shape epoch) and reads the code unit in place; anything else takes the general call (#425).

Every `object.name` read and `object.name = value` write whose name is a
plain name has a record in the data section.

- Reads (`PropertyCacheLayout`): two entries of (shape, slot, byte offset)
  for shaped receivers - slot -1 records that the key is not own - and four
  (prototype, node) entries for inherited properties, valid for one _shape
  epoch_. Every site calls `rt.icGet`, a short hit path: the first shape
  entry's inline slot, or a method found through the first prototype entry.
  Everything else goes on to `rt.getPropertyCached`. Function objects are
  not shaped: a read record also has an own entry (object, node, epoch) for
  a function that has the key as an own property (static members,
  `Ctor.prototype`), which `rt.icGet` and the `.length` sites check. Filling
  it flags the function like a cached prototype, so deleting or redefining
  the property advances the epoch.
- Method calls (`MethodCacheLayout`, #47): the read of `object.name` whose
  value is the callee of the call that follows, with `object` as the
  receiver (flagged `method` by `src/ir/calls.ts`), has a read record plus
  four (shape, prototype, node, epoch) entries and calls `rt.icMethod`. A
  shaped receiver with the shape and prototype of an entry at the current
  epoch reads the node, so a site that calls one method over several
  classes needs no shape lookup. Primitives, unshaped receivers and a shape
  whose first shape entry has the key as its own go to `rt.icGet`; other
  misses call it and copy what it learned (the shape without the key, the
  node for the prototype) into a method entry. Only method sites have these
  entries: every read record growing by them cost about 6 % on lodash.
  The call itself checks that the callee is a plain function (not bound, a
  generator or async function, an arrow or a class constructor) and that
  the receiver is an object or the callee is strict, and then calls its code
  as a direct call does; anything else is the general call.
- `.length` of a typed array without own properties whose prototype has an
  entry for the intrinsic `%TypedArray%.prototype.length` accessor is read
  from the typed array (0 when its buffer is detached) without calling the
  getter.
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

## Element sites

`object[key]` reads and `object[key] = value` assignments whose key is not a
literal name call `rt.elementGet` and `rt.elementSet`
(`src/runtime/array-elements.ts`) instead of `rt.getProperty` and
`rt.setProperty`. With a Number key that is an integer index they answer
directly:

- a dense slot of an array or plain object that is not a hole (an own data
  property with ordinary attributes, so no prototype element, getter or
  setter can be involved); a write only overwrites an existing slot;
- an in-range element of a typed array whose buffer is not detached; a write
  also needs a Number value and an element type that is neither
  `Uint8Clamped` nor BigInt;
- for a read, a code unit below 256 of a primitive string, answered with a
  static one-unit string (`rt.charStrings`) instead of a new allocation.

Everything else (holes, indices outside the table, string and symbol keys,
proxies, arguments objects, string wrappers) is the generic call with the
same arguments. As with the inline caches, the checks are one shared stub per
direction, not code at every site.

The exception is a site of the program (not of a prelude) whose key is a
proven Number (`numericKey`, `src/ir/numbers.ts`): it first tests inline for a
typed array over a fixed-length buffer that is not detached and an integer
index below its length (`-0` is index 0). A `Float64Array` element is then
read or written in place; `Int32Array` and `Uint8Array` reads and 8- and
32-bit integer writes of a Number take a short out-of-line path. Every other
case, including resizable buffers, BigInt and clamped elements and non-Number
values, calls the stub as before (#240).

### Typed array loops

`src/ir/typed-loops.ts` versions counted loops over typed arrays (#240). It
finds natural loops (a back edge to a block that dominates its source) and
takes a loop when

- the header ends in a branch on `i < bound` into and out of the loop, `i` is
  changed in the loop only by `i++` (or `i = i + 1`), and `bound` is
  `a.length` read in the header or a slot or script binding the loop does not
  write;
- every element access `a[i]` / `a[i] = v` has the key `i`, is reached only
  where `i < bound` holds since `i` last changed, and its receiver is a slot or
  script binding the loop does not write;
- every operation is on a whitelist: constants, copies, script binding loads
  and stores, dead-zone checks, the arithmetic, bitwise, comparison and
  `typeof` operators, element accesses and `length` reads of the receivers.
  Calls, other property accesses, `in`, `instanceof`, allocation, `yield` /
  `await` and exception handlers inside the loop disqualify it.

Every entry edge of such a loop goes through a guard block that calls
`rt.typedLoopGuard` (`src/runtime/typed-loop-guard.ts`). It passes when every
receiver is a typed array over a fixed-length, attached, non-shared
`ArrayBuffer` whose `length` is the intrinsic getter (no own `length`, no
shadowing accessor), the start of `i` is an integer Number >= 0, the bound is
a Number (not NaN) no greater than every receiver's length, and the operands
of the loop's conversions (and the stored values) are primitives, so no
`valueOf` can run. Then control enters a copy of the loop whose element
accesses are marked `unchecked` and whose `length` reads `typedLength`: the code
generator reads and writes the element without receiver, attachment or range
tests and reads `length` from the view. Element types other than `Float64`
still branch to the out-of-line path, and non-Number stored values and BigInt
and clamped elements still call the stub there, out of the loop body. When the
guard fails the original loop runs unchanged. Temporaries that live only in
the loop get fresh slots in the copy; all other slots are shared, so liveness
and the stack maps need nothing special.

Limitations: only `<` with an increasing induction variable, only keys equal
to `i` (not `i + 1`), at most eight loops per function and 16 guard
arguments; a loop that calls any function, even one that cannot touch a
buffer, keeps the per-access checks of the inline path. Prelude code and
generators are not versioned.

## Development aids

`NONA_SHAPE_STATS=1` at compile time adds a counter to every place that
materializes a shaped object and to every reason a transition fails
(`dbg.guard.*` symbols). Read them at exit, for example with gdb and the
symbol map from `NONA_ELF_MAP`.
