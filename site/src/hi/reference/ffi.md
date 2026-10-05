# नेटिव फ़ंक्शन (FFI)

::: info अनुवाद
यह पेज अंग्रेज़ी पेज [Native functions (FFI)](/reference/ffi) का अनुवाद है, जो [`docs/ffi.md`](https://github.com/40oleg/nona/blob/main/docs/ffi.md) से बनता है। अंग्रेज़ी संस्करण ही प्रामाणिक है और उसमें नई जानकारी हो सकती है।
:::

Windows प्रोग्राम बिल्ट-इन `nona:ffi` मॉड्यूल के ज़रिए किसी भी DLL के एक्सपोर्ट किए गए फ़ंक्शन कॉल कर सकते हैं। डिक्लेरेशन कंपाइल के समय रिज़ॉल्व होते हैं: हर `define` कॉल PE इम्पोर्ट टेबल में एक प्रविष्टि जोड़ता है, इसलिए प्रोग्राम `LoadLibrary`/`GetProcAddress` का उपयोग नहीं करता।

```js
import { define, lastError } from 'nona:ffi';

const MessageBoxW = define('user32.dll', 'MessageBoxW', 'i32(ptr,wstr,wstr,u32)');
MessageBoxW(null, 'Hello from Nona', 'Nona', 0);
```

- FFI मॉड्यूल कोड (`.mjs` या `--module`) में उपलब्ध है। `define` को सीधे, तीन स्ट्रिंग लिटरल के साथ कॉल करना होता है: DLL का नाम, एक्सपोर्ट का नाम और सिग्नेचर। इसके अलावा कुछ भी कंपाइल एरर है (`E_FFI_STATIC`)।
- `--target linux-x64` के लिए DLL डिक्लेरेशन अस्वीकार किए जाते हैं (`E_FFI_TARGET`)।
- Linux पर `define('syscall', '<number>', signature)` एक सीधा सिस्टम कॉल घोषित करता है (अधिकतम छह पूर्णांक या `buf` आर्ग्युमेंट; परिणाम कर्नेल द्वारा लौटाया गया कच्चा मान है, विफलता पर ऋणात्मक `errno`)। `win32-x64` के लिए सिस्टम कॉल डिक्लेरेशन अस्वीकार किए जाते हैं।
- `lastError()` सबसे हाल की FFI कॉल के तुरंत बाद सहेजा गया `GetLastError()` लौटाता है।
- अगर DLL या एक्सपोर्ट मौजूद नहीं है, तो Windows लोडर प्रोग्राम शुरू करने से मना कर देता है।

## सिग्नेचर {#signatures}

`result(param, param, ...)`, उदाहरण के लिए `bool(u32,u32,wstr,u32)`।

| टाइप | पैरामीटर | परिणाम |
| --- | --- | --- |
| `i8 i16 i32 i64 u8 u16 u32 u64` | Number (शून्य की ओर काटा गया) या Boolean | Number |
| `ptr` | Number, Boolean, `null`/`undefined` (NULL) | Number |
| `bool` | `i32` की तरह | Boolean (Win32 `BOOL`, शून्येतर मान `true` है) |
| `f32 f64` | Number | Number |
| `wstr` | String → अस्थायी NUL-terminated UTF-16 कॉपी; `null`/`undefined` → NULL | — |
| `str` | String → अस्थायी NUL-terminated UTF-8 कॉपी; `null`/`undefined` → NULL | — |
| `buf` | ArrayBuffer, SharedArrayBuffer, typed array या DataView → उसके बाइट्स का पॉइंटर (view ऑफ़सेट पर); `null`/`undefined` → NULL | — |
| `void` | — | `undefined` |

दूसरे टाइप के आर्ग्युमेंट `TypeError` फेंकते हैं; यही अनुपस्थित आर्ग्युमेंट (पॉइंटर टाइप को छोड़कर, जहाँ `undefined` का अर्थ NULL है) और detached बफ़र के साथ होता है। कॉल किया गया फ़ंक्शन `buf` मेमोरी में लिख सकता है, और आउट-पैरामीटर इसी तरह लौटाए जाते हैं: UTF-16 स्ट्रिंग बफ़र के लिए `Uint16Array` या हैंडल के लिए `Uint8Array(8)` दें। अस्थायी स्ट्रिंग कॉपी कॉल के बाद मुक्त हो जाती हैं; कॉल किए गए फ़ंक्शन को पॉइंटर नहीं रखना चाहिए। कॉलबैक (`cb(...)`) और आउट-पैरामीटर टाइप बाद के संस्करण के लिए आरक्षित हैं।

## `nona:win32` {#nona-win32}

`nona:ffi` पर बने चुने हुए डिक्लेरेशन और सहायक फ़ंक्शन:

- user32: `MessageBoxW`, `GetSystemMetrics`, `SystemParametersInfoW` (स्ट्रिंग पैरामीटर), `SystemParametersInfoBufferW` (बफ़र पैरामीटर);
- kernel32: `CreateMutexW`, `ReleaseMutex`, `CloseHandle`, `GetModuleFileNameW`, `GetCurrentProcessId`;
- advapi32: `RegCreateKeyExW`, `RegOpenKeyExW`, `RegSetValueExW`, `RegQueryValueExW`, `RegDeleteValueW`, `RegDeleteKeyW`, `RegCloseKey`;
- कॉन्स्टेंट, जैसे `HKEY_CURRENT_USER`, `KEY_ALL_ACCESS`, `REG_SZ`, `SPI_SETDESKWALLPAPER`, `SPIF_UPDATEINIFILE`, `ERROR_ALREADY_EXISTS`;
- सहायक `wideString(text)` (NUL-terminated `Uint16Array`), `fromWideString(buffer)` और `readHandle(buffer)`; `lastError` री-एक्सपोर्ट किया गया है।

```js
import { SystemParametersInfoW, SPI_SETDESKWALLPAPER, SPIF_UPDATEINIFILE, SPIF_SENDCHANGE } from 'nona:win32';
SystemParametersInfoW(SPI_SETDESKWALLPAPER, 0, 'C:\\Pictures\\painting.jpg', SPIF_UPDATEINIFILE | SPIF_SENDCHANGE);
```


## Native target availability

Windows/Linux/macOS x64 and ARM64 and FreeBSD/OpenBSD x64 targets are available. Apple Silicon uses the system dyld/libSystem startup path. See the [native platform matrix](/reference/native-platforms) for target names, host API limits and native verification. DLL FFI requires Windows; raw syscall FFI uses Linux, Darwin or BSD kernel numbers.
