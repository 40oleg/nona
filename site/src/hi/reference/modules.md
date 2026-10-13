# बिल्ट-इन मॉड्यूल और ग्लोबल

Nona प्रोग्राम Node.js के बिना चलते हैं। नीचे दिए गए होस्ट API कंपाइलर का हिस्सा हैं: नेटिव रनटाइम और छोटे JavaScript प्रील्यूड हर एक्ज़ीक्यूटेबल में कंपाइल होते हैं, और बिल्ट-इन मॉड्यूल तब कंपाइल होते हैं जब प्रोग्राम उन्हें इम्पोर्ट करता है।

## अवलोकन

| API                                                                                                                                                                                                                                                                                  | प्रकार            | टार्गेट                            | संदर्भ                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `setTimeout`, `setInterval`, `clearTimeout`, `clearInterval`, `setImmediate`/`clearImmediate`, `queueMicrotask`, `performance.now()`                                                                                                                                                 | ग्लोबल            | सभी आठ नेटिव टार्गेट               | [टाइमर और इवेंट लूप](/hi/reference/host-apis)                                                                      |
| `process`                                                                                                                                                                                                                                                                            | ग्लोबल            | सभी आठ नेटिव टार्गेट               | [process](/hi/reference/process)                                                                                   |
| `TextEncoder`, `TextDecoder`                                                                                                                                                                                                                                                         | ग्लोबल            | सभी आठ                             | [फ़ाइल सिस्टम और टेक्स्ट एन्कोडिंग](/hi/reference/fs#textencoder-and-textdecoder)                                  |
| `console.log`                                                                                                                                                                                                                                                                        | ग्लोबल            | सभी आठ                             | स्टैंडर्ड आउटपुट में UTF-8 लिखता है                                                                                |
| `console.error`, `console.warn`                                                                                                                                                                                                                                                      | ग्लोबल            | सभी आठ                             | स्टैंडर्ड एरर में UTF-8 लिखता है (`console.info`, `console.debug`: स्टैंडर्ड आउटपुट)                               |
| `nona:process`, `node:process`                                                                                                                                                                                                                                                       | मॉड्यूल           | सभी आठ नेटिव टार्गेट               | [process](/hi/reference/process)                                                                                   |
| `node:stream`, `stream`, `nona:stream`, `node:stream/promises`, `node:stream/consumers`                                                                                                                                                                                              | मॉड्यूल           | सभी आठ नेटिव टार्गेट               | [स्ट्रीम और स्टैंडर्ड I/O](/hi/reference/process)                                                                  |
| `nona:fs`, `node:fs`                                                                                                                                                                                                                                                                 | मॉड्यूल           | सभी आठ                             | [फ़ाइल सिस्टम और टेक्स्ट एन्कोडिंग](/hi/reference/fs)                                                              |
| `node:async_hooks`, `nona:async_hooks`                                                                                                                                                                                                                                               | मॉड्यूल           | सभी आठ                             | मैनुअल async रिसोर्स, हुक और लोकल कॉन्टेक्स्ट स्टोरेज; नेटिव रिसोर्स हुक और GC द्वारा नष्ट करना उत्पन्न नहीं होते। |
| `node:events`, `events`, `nona:events`                                                                                                                                                                                                                                               | मॉड्यूल           | सभी आठ                             | [EventEmitter और असिंक्रोनस इवेंट हेल्पर](/hi/reference/host-apis#events)                                          |
| `node:path`, `path`, `node:path/posix`, `node:path/win32`                                                                                                                                                                                                                            | मॉड्यूल           | सभी आठ                             | [पाथ](/hi/reference/host-apis#paths-nodepath)                                                                      |
| `nona:http`, `node:http`, `nona:net`, `node:net`, `node:string_decoder`                                                                                                                                                                                                              | मॉड्यूल           | Windows, Linux                     | [नेटवर्किंग (अंग्रेज़ी)](/reference/network)                                                                       |
| `URL`, `URLSearchParams`, `node:url`, `url`                                                                                                                                                                                                                                          | ग्लोबल और मॉड्यूल | सभी आठ                             | [URL](/hi/reference/host-apis#url)                                                                                 |
| `node:os`, `node:tty`, `node:util`, `node:util/types`, `node:assert`, `node:assert/strict`, `node:crypto`, `node:querystring`, `node:timers`, `node:timers/promises`, `node:perf_hooks`, `node:module`, `node:worker_threads`, `node:child_process` (और प्रीफ़िक्स के बिना उनके नाम) | मॉड्यूल           | सभी आठ                             | [Node.js सहायक मॉड्यूल](/hi/reference/host-apis#nodejs-support-modules)                                            |
| `node:buffer`, `buffer`, `nona:buffer`, `Buffer`, `Blob`, `File`                                                                                                                                                                                                                     | ग्लोबल और मॉड्यूल | सभी आठ                             | [Buffer और बाइनरी डेटा](/hi/reference/host-apis#buffer-and-binary-data)                                            |
| `nona:ffi`                                                                                                                                                                                                                                                                           | मॉड्यूल           | Windows (DLL), सभी आठ (सिस्टम कॉल) | [नेटिव फ़ंक्शन (FFI)](/hi/reference/ffi)                                                                           |
| `nona:win32`                                                                                                                                                                                                                                                                         | मॉड्यूल           | Windows                            | नीचे और [FFI](/hi/reference/ffi#nona-win32) में                                                                    |

## नियम

- ग्लोबल स्क्रिप्ट और मॉड्यूल दोनों में उपलब्ध हैं।
- बिल्ट-इन मॉड्यूल मॉड्यूल कोड (`.mjs` या `--module`) से इम्पोर्ट किए जा सकते हैं, CommonJS मॉड्यूल से `require` किए जा सकते हैं (`require('fs')`, `require('node:fs')`), और स्क्रिप्ट से लिटरल `import()` के साथ लोड किए जा सकते हैं। FFI डिक्लेरेशन (`define`) मॉड्यूल कोड में होने चाहिए।
- समर्थित Node मॉड्यूल: `node:fs`, `node:process`, `node:path` (`path` उपनाम), `node:events` (`events`/`nona:events` उपनाम), `node:async_hooks` (`nona:async_hooks` उपनाम), और `node:stream`, `node:stream/promises`, `node:stream/consumers`, `node:buffer` (`buffer`/`nona:buffer` उपनाम)। ग्लोबल `Buffer`, `Blob`, `File`, `URL` और `URLSearchParams` उपलब्ध हैं। नेटवर्किंग के लिए `node:http`, `node:net` और `node:string_decoder` उपलब्ध हैं, और [npm पैकेजों](/reference/npm) के लिए `node:os`, `node:tty`, `node:util`, `node:url`, `node:assert`, `node:crypto`, `node:querystring`, `node:timers`, `node:perf_hooks`, `node:module`, `node:worker_threads` और `node:child_process`।
- `nona:win32` और DLL डिक्लेरेशन के लिए Windows x64 या ARM64 चाहिए; सिस्टम कॉल डिक्लेरेशन चुने गए Linux, Darwin या BSD कर्नेल का उपयोग करते हैं।

## `nona:win32` {#nona-win32}

[`nona:ffi`](/hi/reference/ffi) पर आधारित तैयार डिक्लेरेशन। हर फ़ंक्शन एक नेटिव थंक है: आर्ग्युमेंट उसी तरह बदले जाते हैं जैसा [सिग्नेचर टाइप](/hi/reference/ffi#signatures) के लिए बताया गया है।

### user32

| एक्सपोर्ट                     | सिग्नेचर                                                                                                    |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `MessageBoxW`                 | `i32(ptr hwnd, wstr text, wstr caption, u32 type)`                                                          |
| `GetSystemMetrics`            | `i32(i32 index)`                                                                                            |
| `SystemParametersInfoW`       | `bool(u32 action, u32 param, wstr value, u32 flags)` — `SPI_SETDESKWALLPAPER` जैसे स्ट्रिंग पैरामीटर के लिए |
| `SystemParametersInfoBufferW` | `bool(u32 action, u32 param, buf value, u32 flags)` — `SPI_GETDESKWALLPAPER` जैसे बफ़र पैरामीटर के लिए      |

### kernel32

| एक्सपोर्ट             | सिग्नेचर                                            |
| --------------------- | --------------------------------------------------- |
| `CreateMutexW`        | `ptr(ptr attributes, bool initialOwner, wstr name)` |
| `ReleaseMutex`        | `bool(ptr mutex)`                                   |
| `CloseHandle`         | `bool(ptr handle)`                                  |
| `GetModuleFileNameW`  | `u32(ptr module, buf path, u32 size)`               |
| `GetCurrentProcessId` | `u32()`                                             |

### advapi32

| एक्सपोर्ट          | सिग्नेचर                                                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `RegCreateKeyExW`  | `i32(ptr key, wstr subKey, u32 reserved, ptr class, u32 options, u32 access, ptr security, buf result, buf disposition)` |
| `RegOpenKeyExW`    | `i32(ptr key, wstr subKey, u32 options, u32 access, buf result)`                                                         |
| `RegSetValueExW`   | `i32(ptr key, wstr name, u32 reserved, u32 type, buf data, u32 size)`                                                    |
| `RegQueryValueExW` | `i32(ptr key, wstr name, ptr reserved, buf type, buf data, buf size)`                                                    |
| `RegDeleteValueW`  | `i32(ptr key, wstr name)`                                                                                                |
| `RegDeleteKeyW`    | `i32(ptr key, wstr subKey)`                                                                                              |
| `RegCloseKey`      | `i32(ptr key)`                                                                                                           |

### कॉन्स्टेंट

| एक्सपोर्ट                                                       | मान                                                           |
| --------------------------------------------------------------- | ------------------------------------------------------------- |
| `HKEY_CLASSES_ROOT`, `HKEY_CURRENT_USER`, `HKEY_LOCAL_MACHINE`  | पूर्वनिर्धारित रजिस्ट्री key (sign-extended हैंडल के रूप में) |
| `KEY_READ`, `KEY_WRITE`, `KEY_ALL_ACCESS`                       | `0x20019`, `0x20006`, `0xF003F`                               |
| `REG_SZ`, `REG_DWORD`                                           | `1`, `4`                                                      |
| `ERROR_SUCCESS`, `ERROR_FILE_NOT_FOUND`, `ERROR_ALREADY_EXISTS` | `0`, `2`, `183`                                               |
| `SPI_GETDESKWALLPAPER`, `SPI_SETDESKWALLPAPER`                  | `0x73`, `0x14`                                                |
| `SPIF_UPDATEINIFILE`, `SPIF_SENDCHANGE`                         | `1`, `2`                                                      |
| `MB_OK`, `MB_ICONERROR`, `MB_ICONINFORMATION`                   | `0`, `0x10`, `0x40`                                           |
| `MAX_PATH`                                                      | `260`                                                         |

### सहायक फ़ंक्शन

| एक्सपोर्ट                | विवरण                                                                                         |
| ------------------------ | --------------------------------------------------------------------------------------------- |
| `lastError()`            | सबसे हाल की FFI कॉल के ठीक बाद सहेजा गया `GetLastError()` (`nona:ffi` से री-एक्सपोर्ट)।       |
| `wideString(text)`       | उन `buf` पैरामीटर के लिए NUL-terminated `Uint16Array` जो UTF-16 स्ट्रिंग की अपेक्षा करते हैं। |
| `fromWideString(buffer)` | NUL-terminated UTF-16 बफ़र को डिकोड करता है।                                                  |
| `readHandle(buffer)`     | वह हैंडल (उदाहरण के लिए `HKEY`) पढ़ता है जिसे किसी फ़ंक्शन ने 8-बाइट बफ़र में लिखा है।        |

जो फ़ंक्शन सूची में नहीं हैं, उन्हें [`nona:ffi`](/hi/reference/ffi) के `define` से ख़ुद घोषित करें।

## `node:buffer`, `buffer`, `nona:buffer`

ये उपनाम ग्लोबल `Buffer`, `Blob` और `File` कंस्ट्रक्टर, बाइट वैलिडेटर, base64 हेल्पर, ट्रांसकोडिंग, इंस्पेक्शन सेटिंग और कॉन्स्टेंट एक्सपोर्ट करते हैं। Blob की बाइट और टेक्स्ट स्ट्रीम, BYOB रीडर और ऑब्जेक्ट URL का रजिस्ट्रेशन उपलब्ध हैं। सामान्य URL पार्सिंग ग्लोबल [`URL`](/hi/reference/host-apis#url) करता है; मनमानी Web Stream बनाना अब भी एक अलग डिपेंडेंसी API है। देखें [बाइनरी डेटा](/hi/reference/host-apis#buffer-and-binary-data) और [चलाने योग्य उदाहरण](https://github.com/40oleg/nona/blob/main/site/samples/buffer.mjs)।
