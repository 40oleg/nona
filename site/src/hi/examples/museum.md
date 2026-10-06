# Museum: वॉलपेपर बदलने वाला <Badge type="warning" text="केवल Windows" />

::: warning केवल Windows
यह उदाहरण `nona:win32` के ज़रिए Windows फ़ंक्शन कॉल करता है और केवल `win32-x64` के लिए कंपाइल होता है।
:::

Museum एक बैकग्राउंड प्रोग्राम है जो हर कुछ मिनट में डेस्कटॉप वॉलपेपर के रूप में एक अलग पेंटिंग दिखाता है। यह कंसोल विंडो के बिना चलता है, बदलावों के बीच CPU का उपयोग नहीं करता, केवल एक बार शुरू होता है और ख़ुद को Windows के साथ शुरू होने के लिए पंजीकृत कर सकता है। पूरा प्रोग्राम लगभग 80 पंक्तियों का एक मॉड्यूल है।

## चरण 1: आर्ग्युमेंट

```js
const folder = process.argv[1];
const minutes = Number(process.argv[2] ?? 30);
const install = process.argv.includes('--install');
```

`process.argv[0]` एक्ज़ीक्यूटेबल है और `process.argv[1]` पहला आर्ग्युमेंट। GUI प्रोग्राम के पास कंसोल नहीं होता, इसलिए त्रुटियाँ `MessageBoxW` से दिखाई जाती हैं:

```js
function fail(message) {
  MessageBoxW(null, message, 'Museum', MB_OK | MB_ICONERROR);
  process.exit(1);
}
```

## चरण 2: तस्वीरें

`readdirSync` from `node:fs` lists the folder. This sample joins paths with `\\`; `node:path` is also available.

```js
const pictures = readdirSync(folder)
  .filter(name => /\.(jpe?g|png|bmp)$/i.test(name))
  .sort()
  .map(name => folder.replace(/[\\/]+$/, '') + '\\' + name);
```

## चरण 3: केवल एक इंस्टेंस

नामित mutex तब तक मौजूद रहता है जब तक उसे बनाने वाली प्रोसेस चल रही है। अगर वह पहले से मौजूद है, तो दूसरा Museum चल रहा है।

```js
CreateMutexW(null, false, 'Local\\NonaMuseum');
if (lastError() === ERROR_ALREADY_EXISTS) process.exit(0);
```

`lastError()` पिछली FFI कॉल के ठीक बाद सहेजा गया `GetLastError()` लौटाता है।

## चरण 4: वॉलपेपर सेट करना

```js
SystemParametersInfoW(SPI_SETDESKWALLPAPER, 0, picture, SPIF_UPDATEINIFILE | SPIF_SENDCHANGE)
```

`wstr` पैरामीटर JavaScript स्ट्रिंग को अस्थायी NUL-terminated UTF-16 कॉपी में बदल देता है, इसलिए किसी भी अक्षर वाले पाथ काम करते हैं। `SPIF_UPDATEINIFILE` साइन-आउट के बाद भी वॉलपेपर बनाए रखता है और `SPIF_SENDCHANGE` दूसरे प्रोग्रामों को सूचित करता है।

## चरण 5: बारी-बारी से बदलना

```js
showNext();
setInterval(showNext, minutes * 60 * 1000);
```

लंबित इंटरवल प्रोसेस को जीवित रखता है। टिकों के बीच इवेंट लूप कर्नेल में सोता है, इसलिए इंतज़ार के दौरान प्रोग्राम CPU का उपयोग नहीं करता।

## चरण 6: GUI प्रोग्राम बनाना

<<< ../../../samples/museum.version.json

```sh
node dist/cli.js build museum.mjs -o build/museum.exe --subsystem windows --icon museum.ico --version-info museum.version.json
```

- `--subsystem windows` प्रोग्राम को कंसोल विंडो के बिना शुरू करता है और एक डिफ़ॉल्ट मैनिफ़ेस्ट जोड़ता है (asInvoker, Windows 10/11, per-monitor DPI awareness)।
- `--icon` वह आइकन जोड़ता है जो Explorer और टास्कबार दिखाते हैं।
- `--version-info` Properties → Details भरता है।

इसे एक फ़ोल्डर और मिनटों में अंतराल के साथ चलाएँ:

```powershell
.\build\museum.exe "C:\Users\me\Pictures\Paintings" 30
```

## चरण 7: Windows के साथ शुरू करना (वैकल्पिक)

`--install` के साथ Museum अपनी कमांड लाइन `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` में लिखता है। `RegCreateKeyExW` खोली गई key को 8-बाइट बफ़र में लिखता है, जिसे `readHandle` पढ़ता है; `wideString` `RegSetValueExW` के लिए UTF-16 डेटा बनाता है।

```js
const key = new Uint8Array(8);
RegCreateKeyExW(HKEY_CURRENT_USER, runKey, 0, null, 0, KEY_WRITE, null, key, null);
const command = wideString(`"${process.execPath}" "${folder}" ${minutes}`);
RegSetValueExW(readHandle(key), 'NonaMuseum', 0, REG_SZ, command, command.byteLength);
```

इसे वापस लेने के लिए उस key में `NonaMuseum` वैल्यू हटा दें (उदाहरण के लिए `RegDeleteValueW` से, या Registry Editor में)।

## पूरा सोर्स

<<< ../../../samples/museum.win32.mjs{js}

## यह भी देखें

- [नेटिव फ़ंक्शन (FFI)](/hi/reference/ffi) और [`nona:win32` के एक्सपोर्ट की सूची](/hi/reference/modules#nona-win32)
- [Windows एक्ज़ीक्यूटेबल](/hi/reference/windows-executables)
- [टाइमर और इवेंट लूप](/hi/reference/host-apis)
