# Windows এক্সিকিউটেবল

::: info অনুবাদ
এই পৃষ্ঠাটি ইংরেজি পৃষ্ঠা [Windows executables](/reference/windows-executables)-এর অনুবাদ, যা [`docs/windows-executables.md`](https://github.com/40oleg/nona/blob/main/docs/windows-executables.md) থেকে তৈরি। ইংরেজি সংস্করণটিই প্রামাণিক এবং সেটি আরও নতুন হতে পারে।
:::

## সাবসিস্টেম

`nona build app.js -o app.exe --subsystem windows` PE ইমেজটিকে একটি GUI প্রোগ্রাম হিসেবে চিহ্নিত করে (optional header-এ Subsystem 2)। তখন Windows এটি কনসোল উইন্ডো ছাড়া চালু করে, যা ব্যাকগ্রাউন্ড প্রোগ্রাম ও ট্রে ইউটিলিটির জন্য উপযুক্ত। ডিফল্ট হলো `--subsystem console` (3)। এই অপশনের জন্য `--target win32-x64` প্রয়োজন।

একটি GUI প্রোগ্রাম তবুও উত্তরাধিকারসূত্রে পাওয়া স্ট্যান্ডার্ড আউটপুট হ্যান্ডেলে (যেমন প্যারেন্ট প্রসেসের তৈরি পাইপ) `console.log`-এর আউটপুট লেখে। যখন কোনো স্ট্যান্ডার্ড আউটপুট থাকে না — কনসোল নেই, হ্যান্ডেল বন্ধ বা বিচ্ছিন্ন (detached), অথবা লেখা ব্যর্থ — তখন আউটপুট বাদ দেওয়া হয় এবং প্রোগ্রাম চলতে থাকে; আগের সংস্করণগুলো এক্সিট কোড 1 দিয়ে বন্ধ হয়ে যেত।

## রিসোর্স

```text
nona build app.js -o app.exe --icon app.ico --manifest app.manifest --version-info version.json
```

- `--icon` একটি `.ico` ফাইলের প্রতিটি ছবি যুক্ত করে (`RT_ICON` 1…n ও `RT_GROUP_ICON` 1); Explorer ও টাস্কবার এটি দেখায়।
- `--manifest` একটি অ্যাপ্লিকেশন ম্যানিফেস্ট যুক্ত করে (`RT_MANIFEST` 1)। এটি একটি বৈধ ম্যানিফেস্ট হতে হবে: ত্রুটিপূর্ণ ম্যানিফেস্টসহ প্রোগ্রাম Windows চালু করতে অস্বীকার করে। `--subsystem windows` দিয়ে এবং ম্যানিফেস্ট ছাড়া তৈরি প্রোগ্রাম একটি ডিফল্ট ম্যানিফেস্ট পায়: `asInvoker`, Windows 10/11 সামঞ্জস্য এবং per-monitor DPI awareness।
- `--version-info` একটি JSON অবজেক্ট পড়ে, যাতে `FileVersion`, `ProductVersion` (`"major.minor.build.revision"`, অংশগুলো 0–65535), `ProductName`, `FileDescription`, `CompanyName`, `LegalCopyright`, `OriginalFilename`, `InternalName` ও `Comments`-এর যেকোনোটি থাকতে পারে; এগুলো ফাইলের Properties → Details-এ দেখা যায় (`RT_VERSION` 1, ভাষা 0409, কোড পেজ 04B0)।

```json
{ "FileVersion": "1.0.0.0", "ProductName": "Museum", "FileDescription": "Paintings on the desktop", "CompanyName": "Oleg" }
```

একই অপশনগুলো `compile()`-এ `icon` (বাইট), `manifest` (স্ট্রিং) ও `versionInfo` (অবজেক্ট) হিসেবে পাওয়া যায়। এগুলোর জন্য `--target win32-x64` প্রয়োজন।
