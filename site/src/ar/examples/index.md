# أمثلة

## شروحات خطوة بخطوة

| المثال | ما يعرضه | المنصات |
| --- | --- | --- |
| [مرحبًا بالمؤقتات](/ar/examples/hello) | الدوال والقوالب الحرفية والمهام الدقيقة والمؤقتات | Windows وLinux |
| [Museum: مبدّل خلفيات سطح المكتب](/ar/examples/museum) | ‏`nona:win32` والمؤقتات و`node:fs` و`process` وملف تنفيذي رسومي مع موارد | Windows |
| [حاسبة المصفوفات](/ar/examples/matrix-calculator) | شيفرة ES2020 عادية مع مصفوفات واستثناءات | Windows وLinux |
| [عدّ الكلمات](/ar/examples/word-count) | ‏`node:fs` و`process.argv` و`process.exitCode` و`Map` وRegExp مع Unicode | Windows وLinux |

## أمثلة المستودع

يحتوي المجلد [`examples`](https://github.com/40oleg/nona/tree/main/examples) على برامج صغيرة (`factorial.js` و`fibonacci.js` و`loops.js` و`strings.js` و`modern-expressions-demo.js`). ويضم [`examples/compat`](https://github.com/40oleg/nona/tree/main/examples/compat) أكثر من 80 برنامجًا، واحدًا لكل مجال من اللغة أو المكتبة، يترجمها `npm run compare` ويقارن ناتجها بناتج Node.js.

## بناء أي مثال

::: code-group

```sh [Windows]
node dist/cli.js build examples/fibonacci.js -o build/fibonacci.exe
.\build\fibonacci.exe
```

```sh [Linux]
node dist/cli.js build examples/fibonacci.js -o build/fibonacci --target linux-x64
./build/fibonacci
```

:::

توجد أمثلة هذا الموقع في [`site/samples`](https://github.com/40oleg/nona/tree/main/site/samples)؛ ويترجم التكامل المستمر كلًا منها لمنصاته.
