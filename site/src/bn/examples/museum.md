# Museum: ওয়ালপেপার পরিবর্তক <Badge type="warning" text="কেবল Windows" />

::: warning কেবল Windows
এই উদাহরণটি `nona:win32`-এর মাধ্যমে Windows ফাংশন কল করে এবং কেবল `win32-x64`-এর জন্য কম্পাইল হয়।
:::

Museum একটি ব্যাকগ্রাউন্ড প্রোগ্রাম, যা প্রতি কয়েক মিনিটে ডেস্কটপ ওয়ালপেপার হিসেবে একটি ভিন্ন চিত্রকর্ম দেখায়। এটি কনসোল উইন্ডো ছাড়া চলে, পরিবর্তনের মাঝে CPU ব্যবহার করে না, কেবল একবারই চালু হয় এবং Windows-এর সঙ্গে চালু হওয়ার জন্য নিজেকে নিবন্ধন করতে পারে। পুরো প্রোগ্রামটি প্রায় 80 লাইনের একটি মডিউল।

## ধাপ 1: আর্গুমেন্ট

```js
const folder = process.argv[1];
const minutes = Number(process.argv[2] ?? 30);
const install = process.argv.includes('--install');
```

`process.argv[0]` হলো এক্সিকিউটেবল এবং `process.argv[1]` প্রথম আর্গুমেন্ট। একটি GUI প্রোগ্রামের কনসোল থাকে না, তাই ত্রুটিগুলো `MessageBoxW` দিয়ে দেখানো হয়:

```js
function fail(message) {
  MessageBoxW(null, message, 'Museum', MB_OK | MB_ICONERROR);
  process.exit(1);
}
```

## ধাপ 2: ছবিগুলো

`readdirSync` from `node:fs` lists the folder. This sample joins paths with `\\`; `node:path` is also available.

```js
const pictures = readdirSync(folder)
  .filter(name => /\.(jpe?g|png|bmp)$/i.test(name))
  .sort()
  .map(name => folder.replace(/[\\/]+$/, '') + '\\' + name);
```

## ধাপ 3: একটিমাত্র ইনস্ট্যান্স

একটি নামযুক্ত mutex ততক্ষণ থাকে, যতক্ষণ এটি তৈরি করা প্রসেসটি থাকে। এটি আগে থেকেই থাকলে আরেকটি Museum চলছে।

```js
CreateMutexW(null, false, 'Local\\NonaMuseum');
if (lastError() === ERROR_ALREADY_EXISTS) process.exit(0);
```

`lastError()` আগের FFI কলের ঠিক পরে সংরক্ষিত `GetLastError()` ফেরত দেয়।

## ধাপ 4: ওয়ালপেপার সেট করা

```js
SystemParametersInfoW(SPI_SETDESKWALLPAPER, 0, picture, SPIF_UPDATEINIFILE | SPIF_SENDCHANGE)
```

`wstr` প্যারামিটার JavaScript স্ট্রিংটিকে একটি অস্থায়ী NUL-terminated UTF-16 কপিতে রূপান্তর করে, তাই যেকোনো অক্ষরসহ পাথ কাজ করে। `SPIF_UPDATEINIFILE` সাইন-আউটের পরেও ওয়ালপেপার বজায় রাখে এবং `SPIF_SENDCHANGE` অন্য প্রোগ্রামগুলোকে জানায়।

## ধাপ 5: পালাক্রমে বদলানো

```js
showNext();
setInterval(showNext, minutes * 60 * 1000);
```

একটি অপেক্ষমাণ ইন্টারভাল প্রসেসটিকে জীবিত রাখে। টিকের মাঝে ইভেন্ট লুপ কার্নেলে ঘুমায়, তাই অপেক্ষার সময় প্রোগ্রাম CPU ব্যবহার করে না।

## ধাপ 6: একটি GUI প্রোগ্রাম বিল্ড করা

<<< ../../../samples/museum.version.json

```sh
node dist/cli.js build museum.mjs -o build/museum.exe --subsystem windows --icon museum.ico --version-info museum.version.json
```

- `--subsystem windows` প্রোগ্রামটিকে কনসোল উইন্ডো ছাড়া চালু করে এবং একটি ডিফল্ট ম্যানিফেস্ট যুক্ত করে (asInvoker, Windows 10/11, per-monitor DPI awareness)।
- `--icon` সেই আইকন যুক্ত করে যা Explorer ও টাস্কবার দেখায়।
- `--version-info` Properties → Details পূরণ করে।

একটি ফোল্ডার এবং মিনিটে একটি ব্যবধান দিয়ে এটি চালান:

```powershell
.\build\museum.exe "C:\Users\me\Pictures\Paintings" 30
```

## ধাপ 7: Windows-এর সঙ্গে চালু করা (ঐচ্ছিক)

`--install` দিলে Museum তার কমান্ড লাইন `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`-এ লেখে। `RegCreateKeyExW` খোলা কী-টি একটি 8-বাইট বাফারে লেখে, যা `readHandle` পড়ে; `wideString` `RegSetValueExW`-এর জন্য UTF-16 ডেটা তৈরি করে।

```js
const key = new Uint8Array(8);
RegCreateKeyExW(HKEY_CURRENT_USER, runKey, 0, null, 0, KEY_WRITE, null, key, null);
const command = wideString(`"${process.execPath}" "${folder}" ${minutes}`);
RegSetValueExW(readHandle(key), 'NonaMuseum', 0, REG_SZ, command, command.byteLength);
```

এটি বাতিল করতে সেই কী-তে `NonaMuseum` মানটি মুছে দিন (যেমন `RegDeleteValueW` দিয়ে, অথবা Registry Editor-এ)।

## সম্পূর্ণ সোর্স

<<< ../../../samples/museum.win32.mjs{js}

## আরও দেখুন

- [নেটিভ ফাংশন (FFI)](/bn/reference/ffi) এবং [`nona:win32`-এর এক্সপোর্টের তালিকা](/bn/reference/modules#nona-win32)
- [Windows এক্সিকিউটেবল](/bn/reference/windows-executables)
- [টাইমার ও ইভেন্ট লুপ](/bn/reference/host-apis)
