# Compatibilidad y limitaciones

## Alcance

Nona apunta al lenguaje y los objetos integrados de la 11.ª edición normativa de ECMA-262 (junio de 2020), para scripts y módulos ES. La internacionalización ECMA-402, las APIs del navegador y las de Node.js son especificaciones aparte; Nona solo proporciona las APIs del host enumeradas en la [Referencia](/es/reference/modules). El contrato de completitud se mantiene en [`docs/es2020-contract.md`](https://github.com/40oleg/nona/blob/main/docs/es2020-contract.md).

Una versión se describe como «ES2020 con excepciones documentadas», nunca como totalmente conforme con ES2020.

## `eval` y `Function` {#eval-and-function}

Nona compila de antemano, así que `eval` y los constructores dinámicos de funciones necesitan su texto fuente en tiempo de compilación:

- **Se compila de antemano:** un literal de cadena, una concatenación de literales o una variable a la que solo se asignan esas constantes (el valor se compara en tiempo de ejecución). El `eval` directo ve el ámbito del llamador, `this`, `arguments`, `new.target` y `super`; las formas indirectas (`(0, eval)(…)`, `globalThis.eval(…)`, `eval?.(…)`) se ejecutan en el ámbito global. Las llamadas a `Function`, `GeneratorFunction`, `AsyncFunction` y `AsyncGeneratorFunction` cuyos argumentos son todos literales se compilan con la semántica de CreateDynamicFunction.
- **No soportado:** código calculado en tiempo de ejecución, argumentos spread para `eval` y `$262.evalScript`. Estos lanzan:

```text
EvalError: Nona compiles ahead of time: eval and Function need source text known at compile time
```

El código en tiempo de ejecución se sigue en [#11](https://github.com/40oleg/nona/issues/11).

## Diferencias con Node.js

| Área | Nona | Node.js |
| --- | --- | --- |
| `process.argv` | `[execPath, ...arguments]`: `argv[1]` es el primer argumento | `[node, script, ...arguments]` |
| `process` | `argv`, `env`, `exit`, `exitCode`, `execPath`, `cwd`, `platform`, `arch`, `pid` | Un EventEmitter con streams, `nextTick`, `hrtime`, … |
| Ids de temporizador | Números | Objetos `Timeout` |
| `readFileSync(path)` | Devuelve un `Uint8Array` | Devuelve un `Buffer` |
| Codificaciones | Solo `utf8` | Muchas |
| Mensajes de error en Windows | Contienen la ruta tal como se pasó | Contienen la ruta absoluta |
| Módulos | `nona:*`, `node:fs`, `node:process` y archivos relativos | Todo `node:*` y paquetes npm |
| `require`, `Buffer`, `node:path` | No disponibles | Disponibles |
| `console.log` sin salida estándar | La salida se descarta | La salida se descarta o se produce un error |

## Rendimiento

- Los arrays y `Map`/`Set` guardan sus elementos en estructuras enlazadas; las colecciones muy grandes son más lentas que en V8 ([#13](https://github.com/40oleg/nona/issues/13), [#36](https://github.com/40oleg/nona/issues/36)).
- El motor de RegExp es una VM con backtracking escrita en JavaScript.
- En Windows, los temporizadores se despiertan con el tick del sistema (normalmente 15,6 ms).
- No hay JIT: el código se compila una sola vez, de antemano, sin optimización guiada por perfiles.

## Realms

`$262.createRealm` está soportado para Test262. Algunos constructores implementados en preludios de JavaScript todavía toman los prototipos por defecto del realm equivocado cuando se llaman con un `new.target` de otro realm ([#7](https://github.com/40oleg/nona/issues/7)).

## Plataformas

- Destinos: solo Windows 10/11 x64 y Linux x86-64.
- Los ejecutables de Windows solo importan `KERNEL32.dll`, `KERNELBASE.dll` y las DLL declaradas mediante FFI; los ejecutables de Linux son estáticos y usan llamadas al sistema directamente.
- FFI hacia DLL solo existe en Windows; las llamadas al sistema directas, solo en Linux.
