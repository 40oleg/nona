# OrdinaryToPrimitive and reentrant runtime roots

Продолжение object-methods плана и полной ES2020 цели. Предыдущие методы
проверены; общий user coercion включён после аудита вызывающих helpers.
Исключения/необычные getters последуют отдельно.

- [x] Reusable rootedFn: initialized local Value ranges, snapshots input Values,
  typed container pointers, argv ranges, output container без чтения результата.
  Сохранить существующие local offsets; передавать новый frame size для stack args.
- [x] Native GC tests: input snapshot, heap container, local temporary, output
  container, nested roots, restoration and preserved RAX. Затем core helpers.
- [x] Primitives: input snapshots RDX/R8; output RCX container; locals +64/+80
  binary arithmetic/comparison, +56 unary conversions. ToInt32 scratch +40;
  bitwise binary удерживает второй input через первый callback. Log argv range.
- [x] Objects get/has/delete frame136: base/key RDX/R8, output RCX, normalized
  key Value+80. setArrayLength: raw array header RCX, input RDX, numeric temp+48;
  два observable conversions (ToUint32, затем ToNumber), сохранять source Value.
- [x] arrayJoinBody frame200: input receiver RDX, separator R8, output RCX,
  local Values +80..+160 (6). Raw +56 удерживается receiver. Length/index не roots.
- [x] apply frame248: дополнить существующие roots Values+168/+200/+216;
  не сканировать pointers +184/+192 как Values. Number.toString: radix input,
  receiver primitive and output; корректировать incoming receiver offset.
- [x] OrdinaryToPrimitive: number/default hint valueOf→toString; string hint
  toString→valueOf; noncallable skip, object result продолжает, отсутствие
  primitive result fatal до JS exceptions. ToString и property key используют
  string hint, ToNumber/default arithmetic — number/default hint.
- [x] Stress GC callbacks во всех callers, order/mutations, native/Node examples,
  independent review, full suite, matrix/runtime-memory/development-log updates.

Независимый аудит подтвердил: bind metadata/newInstance/instanceOf с literal
keys пока не становятся reentrant от одних coercion hooks. Для будущих getters
нужны отдельные roots fresh bound output/target, metadata Values+64/+80/+96/+112
и constructor prototype temporaries. ArrayToStringMethod уже root-ит callback.

Rooted helpers снимают scope после обычного возврата. Будущие JS exceptions
должны восстанавливать gcRoots при unwind; fatal ExitProcess не возвращается.
