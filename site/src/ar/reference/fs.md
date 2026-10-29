# نظام الملفات (`nona:fs` و`node:fs`)

::: info ترجمة
هذه الصفحة ترجمة للصفحة الإنجليزية [File system](/reference/fs) المولَّدة من [`docs/fs.md`](https://github.com/40oleg/nona/blob/main/docs/fs.md). النسخة الإنجليزية هي المرجع المعتمد وقد تكون أحدث.
:::

تأتي مجموعة فرعية متزامنة من وحدة `fs` في Node.js مدمجةً، وفوقها صيغ رد النداء (callback) والوعود (promise) للدوال الشائعة. يشير المحدِّدان كلاهما إلى التنفيذ نفسه؛ ويعمل كل من `import fs from 'node:fs'` والاستيرادات المسمّاة و`require('fs')`.

| الدالة                                                                    | ملاحظات                                                                                                                                                                                                                                     |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `readFileSync(path, options?)`                                            | دون ترميز تعيد `Uint8Array` (يعيد Node.js ‏`Buffer`)؛ ومع `'utf8'` تعيد سلسلة.                                                                                                                                                              |
| `writeFileSync(path, data, options?)`                                     | ‏`data`: سلسلة (UTF-8) أو مصفوفة منمَّطة أو DataView أو ArrayBuffer. ‏`{flag: 'a'}` يُلحق بنهاية الملف. `flag`: `w` / `a` / `wx`; POSIX `mode`.                                                                                             |
| `appendFileSync(path, data)`                                              |                                                                                                                                                                                                                                             |
| `existsSync(path)`                                                        |                                                                                                                                                                                                                                             |
| `accessSync(path, mode?)`                                                 | تُلقي `ENOENT` إذا لم يوجد المسار؛ ولا تُفحص بتّات الأذونات.                                                                                                                                                                                |
| `statSync(path, options?)`                                                | `isFile()` و`isDirectory()` و`isSymbolicLink()` و`isBlockDevice()` و`isCharacterDevice()` و`isFIFO()` و`isSocket()` و`size` و`mtimeMs` و`mtime` و`mode`؛ و`{throwIfNoEntry: false}`. `dev`, `ino`; `{bigint: true}` → BigInt `dev` / `ino`. |
| `lstatSync(path, options?)`                                               | مثل `statSync` لكن للرابط نفسه لا لهدفه؛ و`{throwIfNoEntry: false}`. على Windows تُعدّ الروابط الرمزية والوصلات (junctions) روابط.                                                                                                          |
| `readlinkSync(path)`                                                      | هدف الرابط الرمزي (أو وصلة Windows) كما هو مخزَّن؛ و`EINVAL` للملفات الأخرى.                                                                                                                                                                |
| `realpathSync(path)` و`realpathSync.native(path)`                         | المسار المطلق بعد حل الروابط الرمزية.                                                                                                                                                                                                       |
| `readdirSync(path, options?)`                                             | أسماء دون `.` و`..`؛ يعيد `{withFileTypes: true}` كائنات `fs.Dirent` تتضمن `name` و`parentPath` و`path` ودوال `is*()` الخاصة بـ `Stats`.                                                                                                    |
| `mkdirSync(path, {recursive}?)`                                           | مع `recursive` تعيد أول مجلد أُنشئ.                                                                                                                                                                                                         |
| `rmSync(path, {recursive, force}?)`                                       | تحذف ملفًا، أو شجرة مجلدات مع `recursive`؛ ويتجاهل `force` المسار غير الموجود.                                                                                                                                                              |
| `rmdirSync` و`unlinkSync` و`renameSync` و`copyFileSync(src, dest, mode?)` | ‏`constants.COPYFILE_EXCL` مدعوم.                                                                                                                                                                                                           |

المسارات سلاسل (أو `Uint8Array` بترميز UTF-8). ولا يُدعم إلا الترميز `utf8`. والأخطاء كائنات `Error` تحمل رموز Node.js ‏(`ENOENT` و`EEXIST` و`EISDIR` و`ENOTDIR` و`ENOTEMPTY` و`EACCES` و`EPERM` وغيرها) و`syscall` و`path`، وبصيغة الرسائل نفسها في Node.js (على Windows يعرض Node.js المسار المطلق في الرسائل، بينما يعرض Nona المسار كما مُرِّر).

التنفيذ: على Windows تستدعي الوحدة KERNEL32 ‏(`CreateFileW` و`ReadFile` و`FindFirstFileW` وغيرها) عبر [`nona:ffi`](/ar/reference/ffi)؛ وعلى Linux تستخدم استدعاءات نظام خامًا مصرَّحًا عنها بـ `define('syscall', number, signature)`. ولا تُربط إلا دوال المنصة التي تجري الترجمة لها.

## رد النداء والوعود

تقبل الدوال `readFile` و`writeFile` و`appendFile` و`access` و`stat` و`lstat` و`readlink` و`realpath` (مع `realpath.native`) و`readdir` و`mkdir`, `mkdtemp` و`rm` و`rmdir` و`unlink` و`rename`, `truncate` و`copyFile`, `symlink`, `chmod`, `utimes` و`exists` دالة رد نداء بنمط Node.js (`(error, result)`؛ أما `exists` فتمرّر قيمة منطقية فقط). وتعيد الدوال نفسها دون `exists` وعودًا من `fs.promises` ومن الوحدة `node:fs/promises` (`fs/promises` و`nona:fs/promises`)، وهي الكائن نفسه `fs.promises`. تنفّذ الصيغتان العملية المتزامنة عند الاستدعاء، وتؤجّلان فقط استدعاء رد النداء إلى دورة لاحقة أو تحسمان الوعد: فهما لا تُداخلان عمل نظام الملفات مع شيفرة أخرى.

## TextEncoder وTextDecoder {#textencoder-and-textdecoder}

‏`TextEncoder` و`TextDecoder` كائنان عامّان ينفّذان UTF-8 كما يحدده معيار WHATWG Encoding: ‏`encode(string)` و`decode(bufferSource)`، والخياران `fatal` و`ignoreBOM`، واستبدال U+FFFD بالتسلسلات غير الصالحة وأنصاف الأزواج البديلة المنفردة. أما الترميزات الأخرى فترمي `RangeError`.

متاح على Windows وLinux وmacOS بمعماريتي x64 وARM64، وعلى FreeBSD وOpenBSD بمعمارية x64.
