# عدّ الكلمات: fs وprocess

أداة صغيرة لسطر الأوامر تعدّ الكلمات في ملفات نصية، وتطبع تقريرًا، وتكتبه في `word-count.txt`. وتُبنى للمنصتين من المصدر نفسه.

<<< ../../../samples/word-count.mjs{js}

::: code-group

```sh [Windows]
node dist/cli.js build word-count.mjs -o build/word-count.exe
.\build\word-count.exe notes.txt README.md
```

```sh [Linux]
node dist/cli.js build word-count.mjs -o build/word-count --target linux-x64
./build/word-count notes.txt README.md
```

:::

إذا احتوى الملف `a.txt` على `Hello world, hello Nona!` و`Привет мир 😀`، واحتوى `b.txt` على `one two two`:

```text
$ word-count a.txt b.txt missing.txt
missing.txt: not found
a.txt: 6 words, 50 bytes
b.txt: 3 words, 12 bytes
total: 9 words, 7 distinct
  hello: 2
  two: 2
  nona: 1
  one: 1
  world: 1
```

حالة الخروج 1 لأن أحد الملفات كان مفقودًا، و2 عند عدم وجود وسائط، و0 في غير ذلك.

## ملاحظات

- **الوسائط.** ‏`process.argv[0]` هو الملف التنفيذي و`process.argv[1]` هو الوسيط الأول، وعلى خلاف Node.js لا يوجد مسار سكربت. راجع [process](/ar/reference/process).
- **حالة الخروج.** يضبط `process.exitCode` الحالة المستخدمة حين ينتهي البرنامج انتهاءً طبيعيًا؛ أما `process.exit(2)` فينهيه فورًا.
- **الملفات.** تعيد `readFileSync(path, 'utf8')` سلسلة، وتكتب `writeFileSync` بترميز UTF-8؛ وتحمل الأخطاء رموز Node.js مثل `ENOENT`. راجع [نظام الملفات](/ar/reference/fs).
- **النص.** يطابق العلَم `u` و`\p{L}` الحروف في أي نظام كتابة؛ ويعدّ `TextEncoder` بايتات UTF-8.
