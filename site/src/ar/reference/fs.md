# نظام الملفات (`nona:fs` و`node:fs`)

::: info ترجمة
هذه الصفحة ترجمة للصفحة الإنجليزية [File system](/reference/fs) المولَّدة من [`docs/fs.md`](https://github.com/40oleg/nona/blob/main/docs/fs.md). النسخة الإنجليزية هي المرجع المعتمد وقد تكون أحدث.
:::

تأتي مجموعة فرعية متزامنة من وحدة `fs` في Node.js مدمجةً. يشير المحدِّدان كلاهما إلى التنفيذ نفسه؛ ويعمل كل من `import fs from 'node:fs'` والاستيرادات المسمّاة.

| الدالة | ملاحظات |
| --- | --- |
| `readFileSync(path, options?)` | دون ترميز تعيد `Uint8Array` (يعيد Node.js ‏`Buffer`)؛ ومع `'utf8'` تعيد سلسلة. |
| `writeFileSync(path, data, options?)` | ‏`data`: سلسلة (UTF-8) أو مصفوفة منمَّطة أو DataView أو ArrayBuffer. ‏`{flag: 'a'}` يُلحق بنهاية الملف. |
| `appendFileSync(path, data)` | |
| `existsSync(path)` | |
| `statSync(path, options?)` | `isFile()` و`isDirectory()` و`isSymbolicLink()` و`size` و`mtimeMs` و`mtime` و`mode`؛ و`{throwIfNoEntry: false}`. |
| `readdirSync(path)` | الأسماء دون `.` و`..`، بترتيب نظام الملفات. ‏`withFileTypes` غير مدعوم. |
| `mkdirSync(path, {recursive}?)` | مع `recursive` تعيد أول مجلد أُنشئ. |
| `rmdirSync` و`unlinkSync` و`renameSync` و`copyFileSync(src, dest, mode?)` | ‏`constants.COPYFILE_EXCL` مدعوم. |

المسارات سلاسل (أو `Uint8Array` بترميز UTF-8). ولا يُدعم إلا الترميز `utf8`. والأخطاء كائنات `Error` تحمل رموز Node.js ‏(`ENOENT` و`EEXIST` و`EISDIR` و`ENOTDIR` و`ENOTEMPTY` و`EACCES` و`EPERM` وغيرها) و`syscall` و`path`، وبصيغة الرسائل نفسها في Node.js (على Windows يعرض Node.js المسار المطلق في الرسائل، بينما يعرض Nona المسار كما مُرِّر).

التنفيذ: على Windows تستدعي الوحدة KERNEL32 ‏(`CreateFileW` و`ReadFile` و`FindFirstFileW` وغيرها) عبر [`nona:ffi`](/ar/reference/ffi)؛ وعلى Linux تستخدم استدعاءات نظام خامًا مصرَّحًا عنها بـ `define('syscall', number, signature)`. ولا تُربط إلا دوال المنصة التي تجري الترجمة لها.

## TextEncoder وTextDecoder {#textencoder-and-textdecoder}

‏`TextEncoder` و`TextDecoder` كائنان عامّان ينفّذان UTF-8 كما يحدده معيار WHATWG Encoding: ‏`encode(string)` و`decode(bufferSource)`، والخياران `fatal` و`ignoreBOM`، واستبدال U+FFFD بالتسلسلات غير الصالحة وأنصاف الأزواج البديلة المنفردة. أما الترميزات الأخرى فترمي `RangeError`.
