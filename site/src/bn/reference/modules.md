# বিল্ট-ইন মডিউল ও গ্লোবাল

Nona প্রোগ্রাম Node.js ছাড়াই চলে। নিচের হোস্ট API-গুলো কম্পাইলারের অংশ: নেটিভ রানটাইম ও ছোট JavaScript প্রিলিউড প্রতিটি এক্সিকিউটেবলে কম্পাইল হয়, আর বিল্ট-ইন মডিউল কম্পাইল হয় তখনই, যখন প্রোগ্রাম সেগুলো ইমপোর্ট করে।

## সংক্ষিপ্ত বিবরণ

| API | ধরন | টার্গেট | রেফারেন্স |
| --- | --- | --- | --- |
| `setTimeout`, `setInterval`, `clearTimeout`, `clearInterval`, `queueMicrotask`, `performance.now()` | গ্লোবাল | উভয় | [টাইমার ও ইভেন্ট লুপ](/bn/reference/host-apis) |
| `process` | গ্লোবাল | all eight native targets | [process](/bn/reference/process) |
| `TextEncoder`, `TextDecoder` | গ্লোবাল | উভয় | [ফাইল সিস্টেম ও টেক্সট এনকোডিং](/bn/reference/fs#textencoder-and-textdecoder) |
| `console.log` | গ্লোবাল | উভয় | স্ট্যান্ডার্ড আউটপুটে UTF-8 লেখে |
| `nona:process`, `node:process` | মডিউল | all eight native targets | [process](/bn/reference/process) |
| `nona:fs`, `node:fs` | মডিউল | উভয় | [ফাইল সিস্টেম ও টেক্সট এনকোডিং](/bn/reference/fs) |
| `node:async_hooks`, `nona:async_hooks` | modules | all native targets | Manual async resources, hooks and local context storage; native resource hooks and GC destruction are not emitted. |
| `node:events`, `events`, `nona:events` | modules | all native targets | [EventEmitter and asynchronous event helpers](/bn/reference/host-apis#events) |
| `node:path`, `path`, `node:path/posix`, `node:path/win32` | modules | all eight | [Paths](/bn/reference/host-apis#paths-nodepath) |
| `nona:ffi` | মডিউল | Windows (DLL), Linux (সিস্টেম কল) | [নেটিভ ফাংশন (FFI)](/bn/reference/ffi) |
| `nona:win32` | মডিউল | Windows | নিচে এবং [FFI](/bn/reference/ffi#nona-win32)-এ |

## নিয়ম

- গ্লোবালগুলো স্ক্রিপ্ট ও মডিউল উভয়েই উপলব্ধ।
- বিল্ট-ইন মডিউল মডিউল কোড (`.mjs` বা `--module`) থেকে ইমপোর্ট করা যায়, আর স্ক্রিপ্ট থেকে লিটারাল `import()` দিয়ে। FFI ডিক্লারেশন (`define`) মডিউল কোডে থাকতে হবে।
- Supported Node modules: `node:fs`, `node:process`, `node:path` (`path` alias), `node:events` (`events`/`nona:events` aliases), `node:async_hooks` (`nona:async_hooks` alias), and `node:buffer` (`buffer`/`nona:buffer` aliases). Global `Buffer`, `Blob` and `File` are available. CommonJS `require` is not available.
- `nona:win32` ও DLL ডিক্লারেশন কেবল `win32-x64`-এর জন্য কম্পাইল হয়; সিস্টেম কল ডিক্লারেশন কেবল `linux-x64`-এর জন্য।

## `nona:win32` {#nona-win32}

[`nona:ffi`](/bn/reference/ffi)-এর ওপর তৈরি প্রস্তুত ডিক্লারেশন। প্রতিটি ফাংশন একটি নেটিভ থাঙ্ক: আর্গুমেন্টগুলো [সিগনেচার টাইপের](/bn/reference/ffi#signatures) জন্য যেভাবে বর্ণিত সেভাবে রূপান্তরিত হয়।

### user32

| এক্সপোর্ট | সিগনেচার |
| --- | --- |
| `MessageBoxW` | `i32(ptr hwnd, wstr text, wstr caption, u32 type)` |
| `GetSystemMetrics` | `i32(i32 index)` |
| `SystemParametersInfoW` | `bool(u32 action, u32 param, wstr value, u32 flags)` — `SPI_SETDESKWALLPAPER`-এর মতো স্ট্রিং প্যারামিটারের জন্য |
| `SystemParametersInfoBufferW` | `bool(u32 action, u32 param, buf value, u32 flags)` — `SPI_GETDESKWALLPAPER`-এর মতো বাফার প্যারামিটারের জন্য |

### kernel32

| এক্সপোর্ট | সিগনেচার |
| --- | --- |
| `CreateMutexW` | `ptr(ptr attributes, bool initialOwner, wstr name)` |
| `ReleaseMutex` | `bool(ptr mutex)` |
| `CloseHandle` | `bool(ptr handle)` |
| `GetModuleFileNameW` | `u32(ptr module, buf path, u32 size)` |
| `GetCurrentProcessId` | `u32()` |

### advapi32

| এক্সপোর্ট | সিগনেচার |
| --- | --- |
| `RegCreateKeyExW` | `i32(ptr key, wstr subKey, u32 reserved, ptr class, u32 options, u32 access, ptr security, buf result, buf disposition)` |
| `RegOpenKeyExW` | `i32(ptr key, wstr subKey, u32 options, u32 access, buf result)` |
| `RegSetValueExW` | `i32(ptr key, wstr name, u32 reserved, u32 type, buf data, u32 size)` |
| `RegQueryValueExW` | `i32(ptr key, wstr name, ptr reserved, buf type, buf data, buf size)` |
| `RegDeleteValueW` | `i32(ptr key, wstr name)` |
| `RegDeleteKeyW` | `i32(ptr key, wstr subKey)` |
| `RegCloseKey` | `i32(ptr key)` |

### কনস্ট্যান্ট

| এক্সপোর্ট | মান |
| --- | --- |
| `HKEY_CLASSES_ROOT`, `HKEY_CURRENT_USER`, `HKEY_LOCAL_MACHINE` | পূর্বনির্ধারিত রেজিস্ট্রি কী (sign-extended হ্যান্ডেল হিসেবে) |
| `KEY_READ`, `KEY_WRITE`, `KEY_ALL_ACCESS` | `0x20019`, `0x20006`, `0xF003F` |
| `REG_SZ`, `REG_DWORD` | `1`, `4` |
| `ERROR_SUCCESS`, `ERROR_FILE_NOT_FOUND`, `ERROR_ALREADY_EXISTS` | `0`, `2`, `183` |
| `SPI_GETDESKWALLPAPER`, `SPI_SETDESKWALLPAPER` | `0x73`, `0x14` |
| `SPIF_UPDATEINIFILE`, `SPIF_SENDCHANGE` | `1`, `2` |
| `MB_OK`, `MB_ICONERROR`, `MB_ICONINFORMATION` | `0`, `0x10`, `0x40` |
| `MAX_PATH` | `260` |

### সহায়ক ফাংশন

| এক্সপোর্ট | বিবরণ |
| --- | --- |
| `lastError()` | সর্বশেষ FFI কলের ঠিক পরে সংরক্ষিত `GetLastError()` (`nona:ffi` থেকে পুনঃএক্সপোর্ট)। |
| `wideString(text)` | UTF-16 স্ট্রিং প্রত্যাশী `buf` প্যারামিটারের জন্য একটি NUL-terminated `Uint16Array`। |
| `fromWideString(buffer)` | একটি NUL-terminated UTF-16 বাফার ডিকোড করে। |
| `readHandle(buffer)` | কোনো ফাংশন 8-বাইট বাফারে যে হ্যান্ডেল (যেমন একটি `HKEY`) লিখেছে, তা পড়ে। |

তালিকায় নেই এমন ফাংশন [`nona:ffi`](/bn/reference/ffi)-এর `define` দিয়ে নিজেই ঘোষণা করুন।


## Native target availability

Windows/Linux/macOS x64 and ARM64 and FreeBSD/OpenBSD x64 targets are available. Apple Silicon uses the system dyld/libSystem startup path. See the [native platform matrix](/reference/native-platforms) for target names, host API limits and native verification. DLL FFI requires Windows; raw syscall FFI uses Linux, Darwin or BSD kernel numbers.

`node:events` is also supported. It provides EventEmitter and asynchronous event helpers; see the linked host API reference for supported operations and limitations. Blob piping uses its AbortController signals and protects cancellation against stopped event propagation.

## `node:buffer`, `buffer`, `nona:buffer`

The aliases export the global `Buffer`, `Blob` and `File` constructors, byte validators, base64 helpers, transcoding, inspection settings and constants. Blob byte/text streams, BYOB readers and object URL registration/resolution are available. General URL parsing and arbitrary Web Stream construction remain separate dependency APIs. See [binary data](/reference/host-apis#buffer-and-binary-data) and the [runnable sample](https://github.com/40oleg/nona/blob/main/site/samples/buffer.mjs).
