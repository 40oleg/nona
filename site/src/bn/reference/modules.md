# বিল্ট-ইন মডিউল ও গ্লোবাল

[পূর্ণতা নিরীক্ষা](/reference/completeness-audit) (ইংরেজিতে) API-এর সীমা, সীমিত Windows x64 নমুনা এবং Windows-এ কম্পাইল করে WSL2-তে চালানো Linux x64 নমুনা, তুলনা, ঝুঁকি ও অগ্রাধিকারভিত্তিক পরিকল্পনা নথিভুক্ত করে। [স্বাধীন পর্যালোচনার নথিতে](https://github.com/40oleg/nona/blob/main/docs/completeness-review.md#step-6-final-independent-review) চূড়ান্ত সিদ্ধান্ত, পুনরায় চালানো পরীক্ষা এবং অবশিষ্ট সীমাবদ্ধতা রয়েছে।

Nona প্রোগ্রাম Node.js ছাড়াই চলে। নিচের হোস্ট API-গুলো কম্পাইলারের অংশ: নেটিভ রানটাইম ও ছোট JavaScript প্রিলিউড প্রতিটি এক্সিকিউটেবলে কম্পাইল হয়, আর বিল্ট-ইন মডিউল কম্পাইল হয় তখনই, যখন প্রোগ্রাম সেগুলো ইমপোর্ট করে।

## সংক্ষিপ্ত বিবরণ

| API                                                                                                                                                                                                                                                                                                  | ধরন             | টার্গেট                               | রেফারেন্স                                                                                                          |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `setTimeout`, `setInterval`, `clearTimeout`, `clearInterval`, `setImmediate`/`clearImmediate`, `queueMicrotask`, `performance.now()`                                                                                                                                                                 | গ্লোবাল         | all eight native targets              | [টাইমার ও ইভেন্ট লুপ](/bn/reference/host-apis)                                                                     |
| `process`                                                                                                                                                                                                                                                                                            | গ্লোবাল         | all eight native targets              | [process](/bn/reference/process)                                                                                   |
| `TextEncoder`, `TextDecoder`                                                                                                                                                                                                                                                                         | গ্লোবাল         | আটটিই                                 | [ফাইল সিস্টেম ও টেক্সট এনকোডিং](/bn/reference/fs#textencoder-and-textdecoder)                                      |
| `console.log`                                                                                                                                                                                                                                                                                        | গ্লোবাল         | আটটিই                                 | স্ট্যান্ডার্ড আউটপুটে UTF-8 লেখে                                                                                   |
| `console.error`, `console.warn`                                                                                                                                                                                                                                                                      | গ্লোবাল         | আটটিই                                 | স্ট্যান্ডার্ড এররে UTF-8 লেখে (`console.info`, `console.debug`: স্ট্যান্ডার্ড আউটপুট)                              |
| `nona:process`, `node:process`                                                                                                                                                                                                                                                                       | মডিউল           | all eight native targets              | [process](/bn/reference/process)                                                                                   |
| `node:stream`, `stream`, `nona:stream`, `node:stream/promises`, `node:stream/consumers`, `node:stream/web`                                                                                                                                                                                           | modules         | all eight native targets              | [Streams and standard I/O](/bn/reference/process)                                                                  |
| `node:zlib`, `zlib`, `nona:zlib`                                                                                                                                                                                                                                                                     | modules         | all eight native targets              | [zlib](/reference/host-apis#zlib)                                                                                  |
| `nona:json`                                                                                                                                                                                                                                                                                          | modules         | all eight native targets              | [JSON to bytes](/reference/host-apis#json-to-utf-8-bytes)                                                          |
| `nona:fs`, `node:fs`, `node:fs/promises`                                                                                                                                                                                                                                                             | মডিউল           | আটটিই                                 | [ফাইল সিস্টেম ও টেক্সট এনকোডিং](/bn/reference/fs)                                                                  |
| `node:async_hooks`, `nona:async_hooks`                                                                                                                                                                                                                                                               | modules         | আটটিই                                 | Manual async resources, hooks and local context storage; native resource hooks and GC destruction are not emitted. |
| `node:events`, `events`, `nona:events`                                                                                                                                                                                                                                                               | modules         | আটটিই                                 | [EventEmitter and asynchronous event helpers](/bn/reference/host-apis#events)                                      |
| `node:path`, `path`, `node:path/posix`, `node:path/win32`                                                                                                                                                                                                                                            | modules         | all eight                             | [Paths](/bn/reference/host-apis#paths-nodepath)                                                                    |
| `nona:http`, `node:http`, `node:https`, `nona:net`, `node:net`, `node:string_decoder`                                                                                                                                                                                                                | মডিউল           | Windows, Linux                        | [নেটওয়ার্কিং (ইংরেজি)](/reference/network)                                                                        |
| `node:child_process`, `child_process`, `nona:child_process`                                                                                                                                                                                                                                          | মডিউল           | all eight native targets              | [চাইল্ড প্রসেস](/bn/reference/host-apis#child-processes)                                                           |
| `URL`, `URLSearchParams`, `node:url`, `url`                                                                                                                                                                                                                                                          | গ্লোবাল ও মডিউল | আটটিই                                 | [URL](/bn/reference/host-apis#url)                                                                                 |
| `node:os`, `node:tty`, `node:util`, `node:util/types`, `node:assert`, `node:assert/strict`, `node:crypto`, `node:querystring`, `node:timers`, `node:timers/promises`, `node:perf_hooks`, `node:module`, `node:worker_threads`, `node:tls`, `node:http2`, `node:zlib` (এবং প্রিফিক্স ছাড়া তাদের নাম) | মডিউল           | আটটিই                                 | [Node.js সহায়ক মডিউল](/bn/reference/host-apis#nodejs-support-modules)                                             |
| `node:buffer`, `buffer`, `nona:buffer`, `Buffer`, `Blob`, `File`                                                                                                                                                                                                                                     | গ্লোবাল ও মডিউল | আটটিই                                 | [বাইনারি ডেটা (ইংরেজি)](/reference/host-apis#buffer-and-binary-data)                                               |
| `nona:ffi`                                                                                                                                                                                                                                                                                           | মডিউল           | Windows (DLL), all eight (সিস্টেম কল) | [নেটিভ ফাংশন (FFI)](/bn/reference/ffi)                                                                             |
| `nona:win32`                                                                                                                                                                                                                                                                                         | মডিউল           | Windows                               | নিচে এবং [FFI](/bn/reference/ffi#nona-win32)-এ                                                                     |

## নিয়ম

- গ্লোবালগুলো স্ক্রিপ্ট ও মডিউল উভয়েই উপলব্ধ।
- বিল্ট-ইন মডিউল মডিউল কোড (`.mjs` বা `--module`) থেকে ইমপোর্ট করা যায়, CommonJS মডিউল থেকে `require` করা যায় (`require('fs')`, `require('node:fs')`), আর স্ক্রিপ্ট থেকে লিটারাল `import()` দিয়ে লোড করা যায়। FFI ডিক্লারেশন (`define`) মডিউল কোডে থাকতে হবে।
- সমর্থিত Node মডিউল: `node:fs`, `node:process`, `node:path` (`path` অ্যালিয়াস), `node:events` (`events`/`nona:events` অ্যালিয়াস), `node:async_hooks` (`nona:async_hooks` অ্যালিয়াস), এবং `node:stream`, `node:stream/promises`, `node:stream/consumers`, `node:zlib`, `node:buffer` (`buffer`/`nona:buffer` অ্যালিয়াস)। গ্লোবাল `Buffer`, `Blob`, `File`, `URL`, `URLSearchParams` ও `crypto` উপলব্ধ। নেটওয়ার্কিংয়ের জন্য `node:http`, `node:net` ও `node:string_decoder` উপলব্ধ, আর [npm প্যাকেজের](/reference/npm) জন্য `node:os`, `node:tty`, `node:util`, `node:url`, `node:assert`, `node:crypto`, `node:querystring`, `node:timers`, `node:perf_hooks`, `node:module`, `node:worker_threads` ও `node:https`, `node:tls`, `node:http2`।
- `nona:win32` ও DLL ডিক্লারেশন কেবল `win32-x64`-এর জন্য কম্পাইল হয়; সিস্টেম কল ডিক্লারেশন কেবল `linux-x64`-এর জন্য।

## `nona:win32` {#nona-win32}

[`nona:ffi`](/bn/reference/ffi)-এর ওপর তৈরি প্রস্তুত ডিক্লারেশন। প্রতিটি ফাংশন একটি নেটিভ থাঙ্ক: আর্গুমেন্টগুলো [সিগনেচার টাইপের](/bn/reference/ffi#signatures) জন্য যেভাবে বর্ণিত সেভাবে রূপান্তরিত হয়।

### user32

| এক্সপোর্ট                     | সিগনেচার                                                                                                        |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `MessageBoxW`                 | `i32(ptr hwnd, wstr text, wstr caption, u32 type)`                                                              |
| `GetSystemMetrics`            | `i32(i32 index)`                                                                                                |
| `SystemParametersInfoW`       | `bool(u32 action, u32 param, wstr value, u32 flags)` — `SPI_SETDESKWALLPAPER`-এর মতো স্ট্রিং প্যারামিটারের জন্য |
| `SystemParametersInfoBufferW` | `bool(u32 action, u32 param, buf value, u32 flags)` — `SPI_GETDESKWALLPAPER`-এর মতো বাফার প্যারামিটারের জন্য    |

### kernel32

| এক্সপোর্ট             | সিগনেচার                                            |
| --------------------- | --------------------------------------------------- |
| `CreateMutexW`        | `ptr(ptr attributes, bool initialOwner, wstr name)` |
| `ReleaseMutex`        | `bool(ptr mutex)`                                   |
| `CloseHandle`         | `bool(ptr handle)`                                  |
| `GetModuleFileNameW`  | `u32(ptr module, buf path, u32 size)`               |
| `GetCurrentProcessId` | `u32()`                                             |

### advapi32

| এক্সপোর্ট          | সিগনেচার                                                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `RegCreateKeyExW`  | `i32(ptr key, wstr subKey, u32 reserved, ptr class, u32 options, u32 access, ptr security, buf result, buf disposition)` |
| `RegOpenKeyExW`    | `i32(ptr key, wstr subKey, u32 options, u32 access, buf result)`                                                         |
| `RegSetValueExW`   | `i32(ptr key, wstr name, u32 reserved, u32 type, buf data, u32 size)`                                                    |
| `RegQueryValueExW` | `i32(ptr key, wstr name, ptr reserved, buf type, buf data, buf size)`                                                    |
| `RegDeleteValueW`  | `i32(ptr key, wstr name)`                                                                                                |
| `RegDeleteKeyW`    | `i32(ptr key, wstr subKey)`                                                                                              |
| `RegCloseKey`      | `i32(ptr key)`                                                                                                           |

### কনস্ট্যান্ট

| এক্সপোর্ট                                                       | মান                                                           |
| --------------------------------------------------------------- | ------------------------------------------------------------- |
| `HKEY_CLASSES_ROOT`, `HKEY_CURRENT_USER`, `HKEY_LOCAL_MACHINE`  | পূর্বনির্ধারিত রেজিস্ট্রি কী (sign-extended হ্যান্ডেল হিসেবে) |
| `KEY_READ`, `KEY_WRITE`, `KEY_ALL_ACCESS`                       | `0x20019`, `0x20006`, `0xF003F`                               |
| `REG_SZ`, `REG_DWORD`                                           | `1`, `4`                                                      |
| `ERROR_SUCCESS`, `ERROR_FILE_NOT_FOUND`, `ERROR_ALREADY_EXISTS` | `0`, `2`, `183`                                               |
| `SPI_GETDESKWALLPAPER`, `SPI_SETDESKWALLPAPER`                  | `0x73`, `0x14`                                                |
| `SPIF_UPDATEINIFILE`, `SPIF_SENDCHANGE`                         | `1`, `2`                                                      |
| `MB_OK`, `MB_ICONERROR`, `MB_ICONINFORMATION`                   | `0`, `0x10`, `0x40`                                           |
| `MAX_PATH`                                                      | `260`                                                         |

### সহায়ক ফাংশন

| এক্সপোর্ট                | বিবরণ                                                                                |
| ------------------------ | ------------------------------------------------------------------------------------ |
| `lastError()`            | সর্বশেষ FFI কলের ঠিক পরে সংরক্ষিত `GetLastError()` (`nona:ffi` থেকে পুনঃএক্সপোর্ট)।  |
| `wideString(text)`       | UTF-16 স্ট্রিং প্রত্যাশী `buf` প্যারামিটারের জন্য একটি NUL-terminated `Uint16Array`। |
| `fromWideString(buffer)` | একটি NUL-terminated UTF-16 বাফার ডিকোড করে।                                          |
| `readHandle(buffer)`     | কোনো ফাংশন 8-বাইট বাফারে যে হ্যান্ডেল (যেমন একটি `HKEY`) লিখেছে, তা পড়ে।            |

তালিকায় নেই এমন ফাংশন [`nona:ffi`](/bn/reference/ffi)-এর `define` দিয়ে নিজেই ঘোষণা করুন।

## `node:buffer`, `buffer`, `nona:buffer`

এই অ্যালিয়াসগুলো গ্লোবাল `Buffer`, `Blob` ও `File` কনস্ট্রাক্টর, বাইট ভ্যালিডেটর, base64 হেল্পার, ট্রান্সকোডিং, ইন্সপেকশন সেটিং ও কনস্ট্যান্ট এক্সপোর্ট করে। Blob-এর বাইট ও টেক্সট স্ট্রিম, BYOB রিডার এবং অবজেক্ট URL নিবন্ধন উপলব্ধ। সাধারণ URL পার্সিং করে গ্লোবাল [`URL`](/bn/reference/host-apis#url); যেকোনো Web Stream তৈরি এখনও একটি আলাদা ডিপেন্ডেন্সি API। দেখুন [বাইনারি ডেটা (ইংরেজি)](/reference/host-apis#buffer-and-binary-data) ও [চালানোর যোগ্য উদাহরণ](https://github.com/40oleg/nona/blob/main/site/samples/buffer.mjs)।
