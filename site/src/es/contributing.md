# Cómo contribuir

## Entorno de desarrollo

```sh
git clone https://github.com/40oleg/nona.git
cd nona
npm ci
npm run check            # build and run the unit suite
npm run compare          # compile examples/compat and compare with Node.js
npm run compare:linux    # the same for linux-x64
npm run test262:smoke    # a quick pinned Test262 subset
```

La suite compila y ejecuta ejecutables reales: las pruebas PE se ejecutan en Windows y las ELF en Linux, muchas bajo estrés del GC. La CI (`.github/workflows/check.yml`) ejecuta la suite completa y grupos de Test262 en Windows con Node.js 26, y las pruebas nativas en Linux. Las auditorías completas de Test262 se describen en la página de [Test262](/es/reference/test262).

## Flujo de trabajo

- Cada cambio empieza con un issue de GitHub con la motivación, una propuesta y criterios de aceptación.
- Un issue, una rama (`issue-<number>-<short-slug>`), un pull request, cuya descripción contiene `Closes #N`, el diseño, cómo se probó y las limitaciones conocidas.
- Mantén `main` en verde: un pull request solo se fusiona cuando pasa el workflow `check`.
- Los issues, pull requests, mensajes de commit, comentarios de código y la documentación se escriben en inglés.

## Pruebas

Las pruebas están en `tests/*.test.ts`. Usa preferentemente `runOnHost` con el oráculo de Node.js (`runOracle`): así la misma prueba se ejecuta en ambos destinos, bajo estrés del GC, y compara la salida del programa con Node.js.

## Convenciones de código

- El compilador está escrito en TypeScript (`src/`). El código del runtime se emite como x86-64 mediante `RuntimeBuilder` (`src/runtime/*.ts`) o se escribe como preludios de JavaScript (`src/runtime/*-source.ts`) que se compilan en cada ejecutable.
- Los preludios no deben añadir enlaces `var` de nivel superior; envuelve el código en una IIFE.
- Las funciones nativas del runtime siguen la ABI de Win64 (shadow space, alineación de 16 bytes en las llamadas, registros preservados por el llamado). Las funciones que mantienen valores entre llamadas que pueden asignar memoria usan `rootedFn`.
- Cada nueva importación de KERNEL32 necesita un shim de llamada al sistema de Linux en `src/backend/linux/shims.ts`.
- Los ejecutables generados siguen libres de dependencias externas: sin libc, sin toolchain de C y sin DLL incluidas.

## Documentación

Cuando una característica cambia un comportamiento visible para los programas, actualiza:

- `README.md` y `README.ru.md`;
- el documento de referencia en `docs/` (`host-apis.md`, `process.md`, `fs.md`, `ffi.md`, `windows-executables.md`, `test262.md`); el sitio incluye estos archivos automáticamente;
- las páginas del sitio en `site/src/` que describen la característica, como las de [soporte del lenguaje](/es/guide/language-support) o [línea de comandos](/es/reference/cli);
- `CHANGELOG.md` bajo `## Unreleased`, con un enlace al issue.

## Sitio de documentación

El sitio se construye con [VitePress](https://vitepress.dev) a partir de `site/`:

```sh
npm run build              # the compiler, needed to check the samples
cd site
npm ci
npm run dev                # local server with live reload
npm run build              # production build; fails on broken internal links
npm run check:samples      # compiles every program in site/samples
```

Los ejemplos ejecutables son archivos de `site/samples/` incluidos con `<<<`; un nombre que contiene `.win32.` o `.linux.` limita el ejemplo a ese destino. `site/README.md` explica cómo añadir una página. El sitio se despliega en GitHub Pages desde `main` mediante `.github/workflows/pages.yml`.

El sitio está traducido a varios idiomas. Las páginas en inglés son la fuente; las traducciones están en `site/src/<locale>/`. Cuando cambia una página en inglés, actualiza sus traducciones o, como mínimo, asegúrate de que no la contradigan.

## Colaboradores automatizados

Las reglas para agentes —reservar issues con la etiqueta `blocked`, la autoría de los commits y la lista de comprobación de los pull requests— están en [`AGENTS.md`](https://github.com/40oleg/nona/blob/main/AGENTS.md).
