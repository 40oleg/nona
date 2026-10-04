# बिल्ट-इन मॉड्यूल और ग्लोबल

Nona प्रोग्राम Node.js के बिना चलते हैं। नीचे दिए गए होस्ट API कंपाइलर का हिस्सा हैं: नेटिव रनटाइम और छोटे JavaScript प्रील्यूड हर एक्ज़ीक्यूटेबल में कंपाइल होते हैं, और बिल्ट-इन मॉड्यूल तब कंपाइल होते हैं जब प्रोग्राम उन्हें इम्पोर्ट करता है।

## अवलोकन

| API | प्रकार | टार्गेट | संदर्भ |
| --- | --- | --- | --- |
| `setTimeout`, `setInterval`, `clearTimeout`, `clearInterval`, `queueMicrotask`, `performance.now()` | ग्लोबल | दोनों | [टाइमर और इवेंट लूप](/hi/reference/host-apis) |
| `process` | ग्लोबल | दोनों | [process](/hi/reference/process) |
| `TextEncoder`, `TextDecoder` | ग्लोबल | दोनों | [फ़ाइल सिस्टम और टेक्स्ट एन्कोडिंग](/hi/reference/fs#textencoder-and-textdecoder) |
| `console.log` | ग्लोबल | दोनों | स्टैंडर्ड आउटपुट में UTF-8 लिखता है |
| `nona:process`, `node:process` | मॉड्यूल | दोनों | [process](/hi/reference/process) |
| `nona:fs`, `node:fs` | मॉड्यूल | दोनों | [फ़ाइल सिस्टम और टेक्स्ट एन्कोडिंग](/hi/reference/fs) |
| `nona:ffi` | मॉड्यूल | Windows (DLL), Linux (सिस्टम कॉल) | [नेटिव फ़ंक्शन (FFI)](/hi/reference/ffi) |
| `nona:win32` | मॉड्यूल | Windows | नीचे और [FFI](/hi/reference/ffi#nona-win32) में |

## नियम

- ग्लोबल स्क्रिप्ट और मॉड्यूल दोनों में उपलब्ध हैं।
- बिल्ट-इन मॉड्यूल मॉड्यूल कोड (`.mjs` या `--module`) से इम्पोर्ट किए जा सकते हैं, और स्क्रिप्ट से लिटरल `import()` के साथ। FFI डिक्लेरेशन (`define`) मॉड्यूल कोड में होने चाहिए।
- `node:` मॉड्यूलों में से केवल `node:fs` और `node:process` मौजूद हैं; ये Nona के सबसेट के उपनाम हैं, Node.js के इम्प्लीमेंटेशन नहीं। `node:path`, `Buffer` और `require` उपलब्ध नहीं हैं।
- `nona:win32` और DLL डिक्लेरेशन केवल `win32-x64` के लिए कंपाइल होते हैं; सिस्टम कॉल डिक्लेरेशन केवल `linux-x64` के लिए।

## `nona:win32` {#nona-win32}

[`nona:ffi`](/hi/reference/ffi) पर आधारित तैयार डिक्लेरेशन। हर फ़ंक्शन एक नेटिव थंक है: आर्ग्युमेंट उसी तरह बदले जाते हैं जैसा [सिग्नेचर टाइप](/hi/reference/ffi#signatures) के लिए बताया गया है।

### user32

| एक्सपोर्ट | सिग्नेचर |
| --- | --- |
| `MessageBoxW` | `i32(ptr hwnd, wstr text, wstr caption, u32 type)` |
| `GetSystemMetrics` | `i32(i32 index)` |
| `SystemParametersInfoW` | `bool(u32 action, u32 param, wstr value, u32 flags)` — `SPI_SETDESKWALLPAPER` जैसे स्ट्रिंग पैरामीटर के लिए |
| `SystemParametersInfoBufferW` | `bool(u32 action, u32 param, buf value, u32 flags)` — `SPI_GETDESKWALLPAPER` जैसे बफ़र पैरामीटर के लिए |

### kernel32

| एक्सपोर्ट | सिग्नेचर |
| --- | --- |
| `CreateMutexW` | `ptr(ptr attributes, bool initialOwner, wstr name)` |
| `ReleaseMutex` | `bool(ptr mutex)` |
| `CloseHandle` | `bool(ptr handle)` |
| `GetModuleFileNameW` | `u32(ptr module, buf path, u32 size)` |
| `GetCurrentProcessId` | `u32()` |

### advapi32

| एक्सपोर्ट | सिग्नेचर |
| --- | --- |
| `RegCreateKeyExW` | `i32(ptr key, wstr subKey, u32 reserved, ptr class, u32 options, u32 access, ptr security, buf result, buf disposition)` |
| `RegOpenKeyExW` | `i32(ptr key, wstr subKey, u32 options, u32 access, buf result)` |
| `RegSetValueExW` | `i32(ptr key, wstr name, u32 reserved, u32 type, buf data, u32 size)` |
| `RegQueryValueExW` | `i32(ptr key, wstr name, ptr reserved, buf type, buf data, buf size)` |
| `RegDeleteValueW` | `i32(ptr key, wstr name)` |
| `RegDeleteKeyW` | `i32(ptr key, wstr subKey)` |
| `RegCloseKey` | `i32(ptr key)` |

### कॉन्स्टेंट

| एक्सपोर्ट | मान |
| --- | --- |
| `HKEY_CLASSES_ROOT`, `HKEY_CURRENT_USER`, `HKEY_LOCAL_MACHINE` | पूर्वनिर्धारित रजिस्ट्री key (sign-extended हैंडल के रूप में) |
| `KEY_READ`, `KEY_WRITE`, `KEY_ALL_ACCESS` | `0x20019`, `0x20006`, `0xF003F` |
| `REG_SZ`, `REG_DWORD` | `1`, `4` |
| `ERROR_SUCCESS`, `ERROR_FILE_NOT_FOUND`, `ERROR_ALREADY_EXISTS` | `0`, `2`, `183` |
| `SPI_GETDESKWALLPAPER`, `SPI_SETDESKWALLPAPER` | `0x73`, `0x14` |
| `SPIF_UPDATEINIFILE`, `SPIF_SENDCHANGE` | `1`, `2` |
| `MB_OK`, `MB_ICONERROR`, `MB_ICONINFORMATION` | `0`, `0x10`, `0x40` |
| `MAX_PATH` | `260` |

### सहायक फ़ंक्शन

| एक्सपोर्ट | विवरण |
| --- | --- |
| `lastError()` | सबसे हाल की FFI कॉल के ठीक बाद सहेजा गया `GetLastError()` (`nona:ffi` से री-एक्सपोर्ट)। |
| `wideString(text)` | उन `buf` पैरामीटर के लिए NUL-terminated `Uint16Array` जो UTF-16 स्ट्रिंग की अपेक्षा करते हैं। |
| `fromWideString(buffer)` | NUL-terminated UTF-16 बफ़र को डिकोड करता है। |
| `readHandle(buffer)` | वह हैंडल (उदाहरण के लिए `HKEY`) पढ़ता है जिसे किसी फ़ंक्शन ने 8-बाइट बफ़र में लिखा है। |

जो फ़ंक्शन सूची में नहीं हैं, उन्हें [`nona:ffi`](/hi/reference/ffi) के `define` से ख़ुद घोषित करें।


## Native target availability

Windows/Linux x64 and ARM64, Intel macOS and FreeBSD/OpenBSD x64 targets are available. Apple Silicon startup is not enabled. See the [native platform matrix](/reference/native-platforms) for target names, host API limits and native verification. DLL FFI requires Windows; raw syscall FFI uses Linux, Darwin or BSD kernel numbers.
