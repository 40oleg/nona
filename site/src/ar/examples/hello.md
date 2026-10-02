# مرحبًا بالمؤقتات

أصغر برنامج يستخدم حلقة الأحداث.

<<< ../../../samples/hello.js

::: code-group

```sh [Windows]
node dist/cli.js build hello.js -o build/hello.exe
.\build\hello.exe
```

```sh [Linux]
node dist/cli.js build hello.js -o build/hello --target linux-x64
./build/hello
```

:::

```text
Hello, from Nona!
a microtask runs before any timer
tick 1
tick 2
tick 3
done; at least 30 ms passed: true
```

## ما الذي يحدث

1. تعمل الشيفرة في المستوى الأعلى: تطبع التحية، وتضع مهمة دقيقة (microtask) في الطابور، وتشغّل مؤقتًا دوريًا.
2. حين تنتهي الشيفرة في المستوى الأعلى تفرغ حلقة الأحداث طابور مهام Promise أولًا، لذا تعمل المهمة الدقيقة قبل أي مؤقت.
3. تنتظر الحلقة موعد المؤقت التالي دون استهلاك المعالج، وتنفّذ دالة الاستدعاء، ثم تفرغ طابور المهام من جديد.
4. بعد النبضة الثالثة تلغي دالة الاستدعاء المؤقت الدوري. وحين لا تبقى مؤقتات ولا مهام يخرج البرنامج بالحالة 0.

ينطبق على الترتيب ما ينطبق في Node.js: الشيفرة المتزامنة، ثم المهام الدقيقة، ثم المؤقتات حسب الموعد وترتيب التسجيل. راجع [المؤقتات وحلقة الأحداث](/ar/reference/host-apis).
