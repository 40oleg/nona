# الوحدات المدمجة والكائنات العامة

تعمل برامج Nona دون Node.js. واجهات المضيف أدناه جزء من المترجم: بيئة التشغيل الأصلية ومقدّمات JavaScript الصغيرة تُترجَم في كل ملف تنفيذي، والوحدات المدمجة تُترجَم حين يستوردها البرنامج.

## نظرة عامة

| الواجهة | النوع | المنصات | المرجع |
| --- | --- | --- | --- |
| `setTimeout` و`setInterval` و`clearTimeout` و`clearInterval` و`queueMicrotask` و`performance.now()` | عامة | كلتاهما | [المؤقتات وحلقة الأحداث](/ar/reference/host-apis) |
| `process` | عام | all eight native targets | [process](/ar/reference/process) |
| `TextEncoder` و`TextDecoder` | عامة | كلتاهما | [نظام الملفات وترميز النصوص](/ar/reference/fs#textencoder-and-textdecoder) |
| `console.log` | عام | كلتاهما | يكتب UTF-8 إلى المخرج القياسي |
| `nona:process` و`node:process` | وحدات | all eight native targets | [process](/ar/reference/process) |
| `nona:fs` و`node:fs` | وحدات | كلتاهما | [نظام الملفات وترميز النصوص](/ar/reference/fs) |
| `node:async_hooks`, `nona:async_hooks` | modules | all native targets | Manual async resources, hooks and local context storage; native resource hooks and GC destruction are not emitted. |
| `node:events`, `events`, `nona:events` | modules | all native targets | [EventEmitter and asynchronous event helpers](/ar/reference/host-apis#events) |
| `node:path`, `path`, `node:path/posix`, `node:path/win32` | modules | all eight | [Paths](/ar/reference/host-apis#paths-nodepath) |
| `nona:ffi` | وحدة | Windows ‏(DLL)، وLinux (استدعاءات النظام) | [الدوال الأصلية (FFI)](/ar/reference/ffi) |
| `nona:win32` | وحدة | Windows | أدناه وفي [FFI](/ar/reference/ffi#nona-win32) |

## القواعد

- الكائنات العامة متاحة في السكربتات والوحدات.
- يمكن استيراد الوحدات المدمجة من شيفرة الوحدات (`.mjs` أو `--module`) ومن السكربتات عبر `import()` حرفي. ويجب أن تكون تصريحات FFI ‏(`define`) في شيفرة وحدة.
- Supported Node modules: `node:fs`, `node:process`, `node:path` (`path` alias), `node:events` (`events`/`nona:events` aliases), `node:async_hooks` (`nona:async_hooks` alias), and `node:buffer` (`buffer`/`nona:buffer` aliases). Global `Buffer`, `Blob` and `File` are available. CommonJS `require` is not available.
- لا تُترجَم `nona:win32` وتصريحات DLL إلا للمنصة `win32-x64`، ولا تُترجَم تصريحات استدعاءات النظام إلا للمنصة `linux-x64`.

## `nona:win32` {#nona-win32}

تصريحات جاهزة مبنية على [`nona:ffi`](/ar/reference/ffi). كل دالة هي دالة وسيطة أصلية (thunk): تُحوَّل الوسائط كما هو موصوف في [أنواع التوقيعات](/ar/reference/ffi#signatures).

### user32

| التصدير | التوقيع |
| --- | --- |
| `MessageBoxW` | `i32(ptr hwnd, wstr text, wstr caption, u32 type)` |
| `GetSystemMetrics` | `i32(i32 index)` |
| `SystemParametersInfoW` | `bool(u32 action, u32 param, wstr value, u32 flags)`: للمعاملات النصية مثل `SPI_SETDESKWALLPAPER` |
| `SystemParametersInfoBufferW` | `bool(u32 action, u32 param, buf value, u32 flags)`: لمعاملات المخازن مثل `SPI_GETDESKWALLPAPER` |

### kernel32

| التصدير | التوقيع |
| --- | --- |
| `CreateMutexW` | `ptr(ptr attributes, bool initialOwner, wstr name)` |
| `ReleaseMutex` | `bool(ptr mutex)` |
| `CloseHandle` | `bool(ptr handle)` |
| `GetModuleFileNameW` | `u32(ptr module, buf path, u32 size)` |
| `GetCurrentProcessId` | `u32()` |

### advapi32

| التصدير | التوقيع |
| --- | --- |
| `RegCreateKeyExW` | `i32(ptr key, wstr subKey, u32 reserved, ptr class, u32 options, u32 access, ptr security, buf result, buf disposition)` |
| `RegOpenKeyExW` | `i32(ptr key, wstr subKey, u32 options, u32 access, buf result)` |
| `RegSetValueExW` | `i32(ptr key, wstr name, u32 reserved, u32 type, buf data, u32 size)` |
| `RegQueryValueExW` | `i32(ptr key, wstr name, ptr reserved, buf type, buf data, buf size)` |
| `RegDeleteValueW` | `i32(ptr key, wstr name)` |
| `RegDeleteKeyW` | `i32(ptr key, wstr subKey)` |
| `RegCloseKey` | `i32(ptr key)` |

### الثوابت

| التصدير | القيمة |
| --- | --- |
| `HKEY_CLASSES_ROOT` و`HKEY_CURRENT_USER` و`HKEY_LOCAL_MACHINE` | مفاتيح السجل المعرَّفة مسبقًا (كمقابض موسَّعة الإشارة) |
| `KEY_READ` و`KEY_WRITE` و`KEY_ALL_ACCESS` | `0x20019` و`0x20006` و`0xF003F` |
| `REG_SZ` و`REG_DWORD` | `1` و`4` |
| `ERROR_SUCCESS` و`ERROR_FILE_NOT_FOUND` و`ERROR_ALREADY_EXISTS` | `0` و`2` و`183` |
| `SPI_GETDESKWALLPAPER` و`SPI_SETDESKWALLPAPER` | `0x73` و`0x14` |
| `SPIF_UPDATEINIFILE` و`SPIF_SENDCHANGE` | `1` و`2` |
| `MB_OK` و`MB_ICONERROR` و`MB_ICONINFORMATION` | `0` و`0x10` و`0x40` |
| `MAX_PATH` | `260` |

### الدوال المساعدة

| التصدير | الوصف |
| --- | --- |
| `lastError()` | قيمة `GetLastError()` الملتقطة مباشرةً بعد آخر استدعاء FFI (مُعاد تصديرها من `nona:ffi`). |
| `wideString(text)` | ‏`Uint16Array` منتهية بـ NUL لمعاملات `buf` التي تتوقع سلسلة UTF-16. |
| `fromWideString(buffer)` | تفك ترميز مخزن UTF-16 منتهٍ بـ NUL. |
| `readHandle(buffer)` | تقرأ مقبضًا (مثل `HKEY`) كتبته دالة في مخزن بحجم 8 بايت. |

أما الدوال غير المدرجة فصرّح عنها بنفسك باستخدام `define` من [`nona:ffi`](/ar/reference/ffi).


## Native target availability

Windows/Linux/macOS x64 and ARM64 and FreeBSD/OpenBSD x64 targets are available. Apple Silicon uses the system dyld/libSystem startup path. See the [native platform matrix](/reference/native-platforms) for target names, host API limits and native verification. DLL FFI requires Windows; raw syscall FFI uses Linux, Darwin or BSD kernel numbers.

`node:events` is also supported. It provides EventEmitter and asynchronous event helpers; see the linked host API reference for supported operations and limitations. Blob piping uses its AbortController signals and protects cancellation against stopped event propagation.

## `node:buffer`, `buffer`, `nona:buffer`

The aliases export the global `Buffer`, `Blob` and `File` constructors, byte validators, base64 helpers, transcoding, inspection settings and constants. Blob byte/text streams, BYOB readers and object URL registration/resolution are available. General URL parsing and arbitrary Web Stream construction remain separate dependency APIs. See [binary data](/reference/host-apis#buffer-and-binary-data) and the [runnable sample](https://github.com/40oleg/nona/blob/main/site/samples/buffer.mjs).
