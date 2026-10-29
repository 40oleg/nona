# ফাইল সিস্টেম (`nona:fs`, `node:fs`)

::: info অনুবাদ
এই পৃষ্ঠাটি ইংরেজি পৃষ্ঠা [File system](/reference/fs)-এর অনুবাদ, যা [`docs/fs.md`](https://github.com/40oleg/nona/blob/main/docs/fs.md) থেকে তৈরি। ইংরেজি সংস্করণটিই প্রামাণিক এবং সেটি আরও নতুন হতে পারে।
:::

Node.js-এর `fs` মডিউলের একটি সিঙ্ক্রোনাস সাবসেট বিল্ট-ইন, এর ওপরে প্রচলিত ফাংশনগুলোর কলব্যাক ও প্রমিস রূপও আছে। দুটি স্পেসিফায়ারই একই ইমপ্লিমেন্টেশনে রিজলভ হয়; `import fs from 'node:fs'`, নামযুক্ত ইমপোর্ট ও `require('fs')` কাজ করে।

| ফাংশন                                                                     | টীকা                                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `readFileSync(path, options?)`                                            | এনকোডিং ছাড়া একটি `Uint8Array` ফেরত দেয় (Node.js `Buffer` ফেরত দেয়); `'utf8'` দিলে একটি স্ট্রিং।                                                                                                                                        |
| `writeFileSync(path, data, options?)`                                     | `data`: স্ট্রিং (UTF-8), typed array, DataView বা ArrayBuffer। `{flag: 'a'}` শেষে যোগ করে। `flag`: `w` / `a` / `wx`; POSIX `mode`.                                                                                                         |
| `appendFileSync(path, data)`                                              |                                                                                                                                                                                                                                            |
| `existsSync(path)`                                                        |                                                                                                                                                                                                                                            |
| `accessSync(path, mode?)`                                                 | পাথ না থাকলে `ENOENT` ছোড়ে; অনুমতি বিট পরীক্ষা করা হয় না।                                                                                                                                                                                |
| `statSync(path, options?)`                                                | `isFile()`, `isDirectory()`, `isSymbolicLink()`, `isBlockDevice()`, `isCharacterDevice()`, `isFIFO()`, `isSocket()`, `size`, `mtimeMs`, `mtime`, `mode`; `{throwIfNoEntry: false}`। `dev`, `ino`; `{bigint: true}` → BigInt `dev` / `ino`. |
| `lstatSync(path, options?)`                                               | `statSync`-এর মতোই, তবে লিংকের লক্ষ্যের নয়, লিংকের নিজের জন্য; `{throwIfNoEntry: false}`। Windows-এ সিম্বলিক লিংক ও জাংশন লিংক হিসেবে গণ্য।                                                                                               |
| `readlinkSync(path)`                                                      | সিম্বলিক লিংকের (বা Windows জাংশনের) লক্ষ্য, যেভাবে সংরক্ষিত; অন্য ফাইলের জন্য `EINVAL`।                                                                                                                                                   |
| `realpathSync(path)`, `realpathSync.native(path)`                         | সিম্বলিক লিংক সমাধানের পরে ক্যানোনিকাল পূর্ণ পাথ।                                                                                                                                                                                          |
| `readdirSync(path, options?)`                                             | `.` এবং `..` বাদে নাম; `{withFileTypes: true}` দিলে `name`, `parentPath`, `path` এবং `Stats`-এর `is*()` মেথডসহ `fs.Dirent` অবজেক্ট পাওয়া যায়।                                                                                            |
| `mkdirSync(path, {recursive}?)`                                           | `recursive` দিলে তৈরি হওয়া প্রথম ডিরেক্টরি ফেরত দেয়।                                                                                                                                                                                     |
| `rmSync(path, {recursive, force}?)`                                       | একটি ফাইল মোছে, `recursive` দিলে ডিরেক্টরি ট্রি মোছে; `force` অনুপস্থিত পাথ উপেক্ষা করে।                                                                                                                                                   |
| `rmdirSync`, `unlinkSync`, `renameSync`, `copyFileSync(src, dest, mode?)` | `constants.COPYFILE_EXCL` সমর্থিত।                                                                                                                                                                                                         |

পাথ হলো স্ট্রিং (অথবা UTF-8 `Uint8Array`)। কেবল `utf8` এনকোডিং সমর্থিত। ত্রুটিগুলো হলো Node.js কোড (`ENOENT`, `EEXIST`, `EISDIR`, `ENOTDIR`, `ENOTEMPTY`, `EACCES`, `EPERM`, …), `syscall` ও `path`-সহ `Error` অবজেক্ট, এবং বার্তার ফরম্যাট Node.js-এর মতোই (Windows-এ Node.js বার্তায় পরম পাথ দেখায়; Nona পাথটি যেভাবে দেওয়া হয়েছে সেভাবেই দেখায়)।

ইমপ্লিমেন্টেশন: Windows-এ মডিউলটি [`nona:ffi`](/bn/reference/ffi)-এর মাধ্যমে KERNEL32 (`CreateFileW`, `ReadFile`, `FindFirstFileW`, …) কল করে; Linux-এ এটি `define('syscall', number, signature)` দিয়ে ঘোষিত সরাসরি সিস্টেম কল ব্যবহার করে। কেবল যে প্ল্যাটফর্মের জন্য কম্পাইল করা হচ্ছে, তার ফাংশনগুলোই লিঙ্ক হয়।

## কলব্যাক ও প্রমিস

`readFile`, `writeFile`, `appendFile`, `access`, `stat`, `lstat`, `readlink`, `realpath` (`realpath.native`-সহ), `readdir`, `mkdir`, `mkdtemp`, `rm`, `rmdir`, `unlink`, `rename`, `truncate`, `copyFile`, `symlink`, `chmod`, `utimes` ও `exists` Node.js-স্টাইলের কলব্যাক নেয় (`(error, result)`; `exists` কেবল একটি বুলিয়ান পাঠায়)। `exists` ছাড়া একই ফাংশনগুলো `fs.promises` থেকে এবং `node:fs/promises` মডিউল (`fs/promises`, `nona:fs/promises`) থেকে প্রমিস ফেরত দেয়; এটি `fs.promises`-এর সঙ্গে একই অবজেক্ট। দুই রূপই কল করার সময়ই সিঙ্ক্রোনাস অপারেশন চালায় এবং কেবল কলব্যাক পরবর্তী টিকে পিছিয়ে দেয় বা প্রমিস সেটল করে: ফাইল সিস্টেমের কাজ অন্য কোডের সঙ্গে ওভারল্যাপ করে না।

## TextEncoder ও TextDecoder {#textencoder-and-textdecoder}

`TextEncoder` ও `TextDecoder` গ্লোবাল এবং WHATWG Encoding স্ট্যান্ডার্ডে নির্ধারিত পদ্ধতিতে UTF-8 বাস্তবায়ন করে: `encode(string)`, `decode(bufferSource)`, `fatal` ও `ignoreBOM` অপশন, অবৈধ ক্রম ও একক সারোগেটের U+FFFD দিয়ে প্রতিস্থাপন। অন্য এনকোডিং `RangeError` ছোড়ে।

Windows, Linux ও macOS (x64 ও ARM64), FreeBSD ও OpenBSD (x64)-এ উপলব্ধ।
