# फ़ाइल सिस्टम (`nona:fs`, `node:fs`)

::: info अनुवाद
यह पेज अंग्रेज़ी पेज [File system](/reference/fs) का अनुवाद है, जो [`docs/fs.md`](https://github.com/40oleg/nona/blob/main/docs/fs.md) से बनता है। अंग्रेज़ी संस्करण ही प्रामाणिक है और उसमें नई जानकारी हो सकती है।
:::

Node.js के `fs` मॉड्यूल का एक सिंक्रोनस सबसेट बिल्ट-इन है। दोनों स्पेसिफ़ायर एक ही इम्प्लीमेंटेशन पर रिज़ॉल्व होते हैं; `import fs from 'node:fs'` और नामित इम्पोर्ट दोनों काम करते हैं।

| फ़ंक्शन | टिप्पणी |
| --- | --- |
| `readFileSync(path, options?)` | एन्कोडिंग के बिना `Uint8Array` लौटाता है (Node.js `Buffer` लौटाता है); `'utf8'` के साथ स्ट्रिंग। |
| `writeFileSync(path, data, options?)` | `data`: स्ट्रिंग (UTF-8), typed array, DataView या ArrayBuffer। `{flag: 'a'}` अंत में जोड़ता है। `flag`: `w` / `a` / `wx`; POSIX `mode`. |
| `appendFileSync(path, data)` | |
| `existsSync(path)` | |
| `statSync(path, options?)` | `isFile()`, `isDirectory()`, `isSymbolicLink()`, `size`, `mtimeMs`, `mtime`, `mode`; `{throwIfNoEntry: false}`। `dev`, `ino`; `{bigint: true}` → BigInt `dev` / `ino`. |
| `realpathSync(path)` | प्रतीकात्मक लिंक हल करने के बाद कैनोनिकल पूर्ण पथ। |
| `readdirSync(path, options?)` | `.` और `..` के बिना नाम; `{withFileTypes: true}` से `name`, `isFile()`, `isDirectory()`, `isSymbolicLink()` वाली प्रविष्टियाँ मिलती हैं। |
| `mkdirSync(path, {recursive}?)` | `recursive` के साथ, बनाई गई पहली डायरेक्टरी लौटाता है। |
| `rmdirSync`, `unlinkSync`, `renameSync`, `copyFileSync(src, dest, mode?)` | `constants.COPYFILE_EXCL` समर्थित है। |

पाथ स्ट्रिंग होते हैं (या UTF-8 `Uint8Array`)। केवल `utf8` एन्कोडिंग समर्थित है। त्रुटियाँ `Error` ऑब्जेक्ट होती हैं जिनमें Node.js कोड (`ENOENT`, `EEXIST`, `EISDIR`, `ENOTDIR`, `ENOTEMPTY`, `EACCES`, `EPERM`, …), `syscall` और `path` होते हैं, और संदेश का फ़ॉर्मैट Node.js जैसा ही होता है (Windows पर Node.js संदेशों में निरपेक्ष पाथ दिखाता है; Nona पाथ वैसा ही दिखाता है जैसा दिया गया था)।

इम्प्लीमेंटेशन: Windows पर मॉड्यूल [`nona:ffi`](/hi/reference/ffi) के ज़रिए KERNEL32 (`CreateFileW`, `ReadFile`, `FindFirstFileW`, …) को कॉल करता है; Linux पर यह `define('syscall', number, signature)` से घोषित सीधे सिस्टम कॉल का उपयोग करता है। केवल उस प्लेटफ़ॉर्म के फ़ंक्शन लिंक होते हैं जिसके लिए कंपाइल किया जा रहा है।

## TextEncoder और TextDecoder {#textencoder-and-textdecoder}

`TextEncoder` और `TextDecoder` ग्लोबल हैं और WHATWG Encoding मानक के अनुसार UTF-8 लागू करते हैं: `encode(string)`, `decode(bufferSource)`, `fatal` और `ignoreBOM` विकल्प, अमान्य अनुक्रमों और अकेले सरोगेट का U+FFFD से प्रतिस्थापन। अन्य एन्कोडिंग `RangeError` फेंकती हैं।
