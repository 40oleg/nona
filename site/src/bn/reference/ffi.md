# নেটিভ ফাংশন (FFI)

::: info অনুবাদ
এই পৃষ্ঠাটি ইংরেজি পৃষ্ঠা [Native functions (FFI)](/reference/ffi)-এর অনুবাদ, যা [`docs/ffi.md`](https://github.com/40oleg/nona/blob/main/docs/ffi.md) থেকে তৈরি। ইংরেজি সংস্করণটিই প্রামাণিক এবং সেটি আরও নতুন হতে পারে।
:::

Windows প্রোগ্রাম বিল্ট-ইন `nona:ffi` মডিউলের মাধ্যমে যেকোনো DLL-এর এক্সপোর্ট করা ফাংশন কল করতে পারে। ডিক্লারেশনগুলো কম্পাইলের সময় রিজলভ হয়: প্রতিটি `define` কল PE ইমপোর্ট টেবিলে একটি এন্ট্রি যোগ করে, তাই প্রোগ্রাম `LoadLibrary`/`GetProcAddress` ব্যবহার করে না।

```js
import { define, lastError } from 'nona:ffi';

const MessageBoxW = define('user32.dll', 'MessageBoxW', 'i32(ptr,wstr,wstr,u32)');
MessageBoxW(null, 'Hello from Nona', 'Nona', 0);
```

- FFI মডিউল কোডে (`.mjs` বা `--module`) উপলব্ধ। `define` সরাসরি, তিনটি স্ট্রিং লিটারাল দিয়ে কল করতে হবে: DLL-এর নাম, এক্সপোর্টের নাম এবং সিগনেচার। অন্য যেকোনো কিছু কম্পাইল ত্রুটি (`E_FFI_STATIC`)।
- `--target linux-x64`-এর জন্য DLL ডিক্লারেশন প্রত্যাখ্যাত হয় (`E_FFI_TARGET`)।
- Linux-এ `define('syscall', '<number>', signature)` একটি সরাসরি সিস্টেম কল ঘোষণা করে (সর্বোচ্চ ছয়টি পূর্ণসংখ্যা বা `buf` আর্গুমেন্ট; ফলাফল হলো কার্নেলের ফেরত দেওয়া কাঁচা মান, ব্যর্থ হলে ঋণাত্মক `errno`)। `win32-x64`-এর জন্য সিস্টেম কল ডিক্লারেশন প্রত্যাখ্যাত হয়।
- `lastError()` সর্বশেষ FFI কলের অব্যবহিত পরে সংরক্ষিত `GetLastError()` ফেরত দেয়।
- DLL বা এক্সপোর্ট অনুপস্থিত থাকলে Windows লোডার প্রোগ্রাম চালু করতে অস্বীকার করে।

## সিগনেচার {#signatures}

`result(param, param, ...)`, যেমন `bool(u32,u32,wstr,u32)`।

| টাইপ | প্যারামিটার | ফলাফল |
| --- | --- | --- |
| `i8 i16 i32 i64 u8 u16 u32 u64` | Number (শূন্যের দিকে ছাঁটা) বা Boolean | Number |
| `ptr` | Number, Boolean, `null`/`undefined` (NULL) | Number |
| `bool` | `i32`-এর মতো | Boolean (Win32 `BOOL`, শূন্য-ভিন্ন মান `true`) |
| `f32 f64` | Number | Number |
| `wstr` | String → অস্থায়ী NUL-terminated UTF-16 কপি; `null`/`undefined` → NULL | — |
| `str` | String → অস্থায়ী NUL-terminated UTF-8 কপি; `null`/`undefined` → NULL | — |
| `buf` | ArrayBuffer, SharedArrayBuffer, typed array বা DataView → এর বাইটগুলোর পয়েন্টার (view অফসেটে); `null`/`undefined` → NULL | — |
| `void` | — | `undefined` |

অন্য টাইপের আর্গুমেন্ট `TypeError` ছোড়ে; অনুপস্থিত আর্গুমেন্টও (পয়েন্টার টাইপ ছাড়া, যেখানে `undefined` মানে NULL) এবং detached বাফারও তাই করে। কল করা ফাংশন `buf` মেমরিতে লিখতে পারে, আর আউট-প্যারামিটার এভাবেই ফেরত আসে: UTF-16 স্ট্রিং বাফারের জন্য একটি `Uint16Array` বা হ্যান্ডেলের জন্য একটি `Uint8Array(8)` দিন। অস্থায়ী স্ট্রিং কপিগুলো কলের পরে মুক্ত হয়; কল করা ফাংশন পয়েন্টারটি রেখে দিতে পারবে না। কলব্যাক (`cb(...)`) ও আউট-প্যারামিটার টাইপ পরবর্তী সংস্করণের জন্য সংরক্ষিত।

## `nona:win32` {#nona-win32}

`nona:ffi`-এর ওপর তৈরি বাছাই করা ডিক্লারেশন ও সহায়ক ফাংশন:

- user32: `MessageBoxW`, `GetSystemMetrics`, `SystemParametersInfoW` (স্ট্রিং প্যারামিটার), `SystemParametersInfoBufferW` (বাফার প্যারামিটার);
- kernel32: `CreateMutexW`, `ReleaseMutex`, `CloseHandle`, `GetModuleFileNameW`, `GetCurrentProcessId`;
- advapi32: `RegCreateKeyExW`, `RegOpenKeyExW`, `RegSetValueExW`, `RegQueryValueExW`, `RegDeleteValueW`, `RegDeleteKeyW`, `RegCloseKey`;
- কনস্ট্যান্ট, যেমন `HKEY_CURRENT_USER`, `KEY_ALL_ACCESS`, `REG_SZ`, `SPI_SETDESKWALLPAPER`, `SPIF_UPDATEINIFILE`, `ERROR_ALREADY_EXISTS`;
- সহায়ক `wideString(text)` (NUL-terminated `Uint16Array`), `fromWideString(buffer)` ও `readHandle(buffer)`; `lastError` পুনঃএক্সপোর্ট করা।

```js
import { SystemParametersInfoW, SPI_SETDESKWALLPAPER, SPIF_UPDATEINIFILE, SPIF_SENDCHANGE } from 'nona:win32';
SystemParametersInfoW(SPI_SETDESKWALLPAPER, 0, 'C:\\Pictures\\painting.jpg', SPIF_UPDATEINIFILE | SPIF_SENDCHANGE);
```
