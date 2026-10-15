# Módulos embutidos e globais

Os programas Nona rodam sem Node.js. As APIs do host abaixo fazem parte do compilador: o runtime nativo e pequenos prelúdios JavaScript são compilados em cada executável, e os módulos embutidos são compilados quando um programa os importa.

## Visão geral

| API                                                                                                                                                                                                                                                      | Tipo              | Alvos                                         | Referência                                                                                                                                |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `setTimeout`, `setInterval`, `clearTimeout`, `clearInterval`, `setImmediate`/`clearImmediate`, `queueMicrotask`, `performance.now()`                                                                                                                     | globais           | todos os oito alvos nativos                   | [Timers e o loop de eventos](/pt/reference/host-apis)                                                                                     |
| `process`                                                                                                                                                                                                                                                | global            | todos os oito alvos nativos                   | [process](/pt/reference/process)                                                                                                          |
| `TextEncoder`, `TextDecoder`                                                                                                                                                                                                                             | globais           | os oito                                       | [Sistema de arquivos e codificação de texto](/pt/reference/fs#textencoder-and-textdecoder)                                                |
| `console.log`                                                                                                                                                                                                                                            | global            | os oito                                       | escreve UTF-8 na saída padrão                                                                                                             |
| `console.error`, `console.warn`                                                                                                                                                                                                                          | global            | os oito                                       | escreve UTF-8 na saída de erro padrão (`console.info`, `console.debug`: saída padrão)                                                     |
| `nona:process`, `node:process`                                                                                                                                                                                                                           | módulos           | todos os oito alvos nativos                   | [process](/pt/reference/process)                                                                                                          |
| `node:stream`, `stream`, `nona:stream`, `node:stream/promises`, `node:stream/consumers`                                                                                                                                                                  | módulos           | todos os oito alvos nativos                   | [Streams e E/S padrão](/pt/reference/process)                                                                                             |
| `nona:fs`, `node:fs`                                                                                                                                                                                                                                     | módulos           | os oito                                       | [Sistema de arquivos e codificação de texto](/pt/reference/fs)                                                                            |
| `node:async_hooks`, `nona:async_hooks`                                                                                                                                                                                                                   | módulos           | todos os oito alvos nativos                   | Recursos assíncronos manuais, hooks e armazenamento de contexto local; hooks nativos de recursos e a destruição pelo GC não são emitidos. |
| `node:events`, `events`, `nona:events`                                                                                                                                                                                                                   | módulos           | todos os oito alvos nativos                   | [EventEmitter e auxiliares de eventos assíncronos](/pt/reference/host-apis#events)                                                        |
| `node:path`, `path`, `node:path/posix`, `node:path/win32`                                                                                                                                                                                                | módulos           | os oito                                       | [Caminhos](/pt/reference/host-apis#paths-nodepath)                                                                                        |
| `nona:http`, `node:http`, `nona:net`, `node:net`, `node:string_decoder`                                                                                                                                                                                  | módulos           | Windows, Linux                                | [Rede (em inglês)](/reference/network)                                                                                                    |
| `node:child_process`, `child_process`, `nona:child_process`                                                                                                                                                                                              | módulos           | Windows, Linux                                | [Processos filhos](/pt/reference/host-apis#child-processes)                                                                               |
| `URL`, `URLSearchParams`, `node:url`, `url`                                                                                                                                                                                                              | globais e módulo  | os oito                                       | [URL](/pt/reference/host-apis#url)                                                                                                        |
| `node:os`, `node:tty`, `node:util`, `node:util/types`, `node:assert`, `node:assert/strict`, `node:crypto`, `node:querystring`, `node:timers`, `node:timers/promises`, `node:perf_hooks`, `node:module`, `node:worker_threads` (e seus nomes sem prefixo) | módulos           | os oito                                       | [Módulos de apoio do Node.js](/pt/reference/host-apis#nodejs-support-modules)                                                             |
| `node:buffer`, `buffer`, `nona:buffer`, `Buffer`, `Blob`, `File`                                                                                                                                                                                         | globais e módulos | os oito                                       | [Dados binários (em inglês)](/reference/host-apis#buffer-and-binary-data)                                                                 |
| `nona:ffi`                                                                                                                                                                                                                                               | módulo            | Windows (DLLs), os oito (chamadas de sistema) | [Funções nativas (FFI)](/pt/reference/ffi)                                                                                                |
| `nona:win32`                                                                                                                                                                                                                                             | módulo            | Windows                                       | abaixo e em [FFI](/pt/reference/ffi#nona-win32)                                                                                           |

## Regras

- Os globais estão disponíveis em scripts e módulos.
- Módulos embutidos podem ser importados em código de módulo (`.mjs` ou `--module`), carregados com `require` em módulos CommonJS (`require('fs')`, `require('node:fs')`) e com `import()` literal em scripts. Declarações FFI (`define`) precisam estar em código de módulo.
- Módulos do Node suportados: `node:fs`, `node:process`, `node:path` (alias `path`), `node:events` (aliases `events`/`nona:events`), `node:async_hooks` (alias `nona:async_hooks`), e `node:stream`, `node:stream/promises`, `node:stream/consumers`, `node:buffer` (aliases `buffer`/`nona:buffer`). Os globais `Buffer`, `Blob`, `File`, `URL` e `URLSearchParams` estão disponíveis. `node:http`, `node:net` e `node:string_decoder` estão disponíveis para rede, e `node:os`, `node:tty`, `node:util`, `node:url`, `node:assert`, `node:crypto`, `node:querystring`, `node:timers`, `node:perf_hooks`, `node:module`, `node:worker_threads` e `node:child_process` para [pacotes npm](/reference/npm).
- `nona:win32` e declarações de DLL só compilam para `win32-x64`; declarações de chamadas de sistema, só para `linux-x64`.

## `nona:win32` {#nona-win32}

Declarações prontas construídas sobre [`nona:ffi`](/pt/reference/ffi). Cada função é um thunk nativo: os argumentos são convertidos como descrito para os [tipos de assinatura](/pt/reference/ffi#signatures).

### user32

| Exportação                    | Assinatura                                                                                                   |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `MessageBoxW`                 | `i32(ptr hwnd, wstr text, wstr caption, u32 type)`                                                           |
| `GetSystemMetrics`            | `i32(i32 index)`                                                                                             |
| `SystemParametersInfoW`       | `bool(u32 action, u32 param, wstr value, u32 flags)` — para parâmetros de string como `SPI_SETDESKWALLPAPER` |
| `SystemParametersInfoBufferW` | `bool(u32 action, u32 param, buf value, u32 flags)` — para parâmetros de buffer como `SPI_GETDESKWALLPAPER`  |

### kernel32

| Exportação            | Assinatura                                          |
| --------------------- | --------------------------------------------------- |
| `CreateMutexW`        | `ptr(ptr attributes, bool initialOwner, wstr name)` |
| `ReleaseMutex`        | `bool(ptr mutex)`                                   |
| `CloseHandle`         | `bool(ptr handle)`                                  |
| `GetModuleFileNameW`  | `u32(ptr module, buf path, u32 size)`               |
| `GetCurrentProcessId` | `u32()`                                             |

### advapi32

| Exportação         | Assinatura                                                                                                               |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `RegCreateKeyExW`  | `i32(ptr key, wstr subKey, u32 reserved, ptr class, u32 options, u32 access, ptr security, buf result, buf disposition)` |
| `RegOpenKeyExW`    | `i32(ptr key, wstr subKey, u32 options, u32 access, buf result)`                                                         |
| `RegSetValueExW`   | `i32(ptr key, wstr name, u32 reserved, u32 type, buf data, u32 size)`                                                    |
| `RegQueryValueExW` | `i32(ptr key, wstr name, ptr reserved, buf type, buf data, buf size)`                                                    |
| `RegDeleteValueW`  | `i32(ptr key, wstr name)`                                                                                                |
| `RegDeleteKeyW`    | `i32(ptr key, wstr subKey)`                                                                                              |
| `RegCloseKey`      | `i32(ptr key)`                                                                                                           |

### Constantes

| Exportação                                                      | Valor                                                                |
| --------------------------------------------------------------- | -------------------------------------------------------------------- |
| `HKEY_CLASSES_ROOT`, `HKEY_CURRENT_USER`, `HKEY_LOCAL_MACHINE`  | chaves predefinidas do registro (como handles com extensão de sinal) |
| `KEY_READ`, `KEY_WRITE`, `KEY_ALL_ACCESS`                       | `0x20019`, `0x20006`, `0xF003F`                                      |
| `REG_SZ`, `REG_DWORD`                                           | `1`, `4`                                                             |
| `ERROR_SUCCESS`, `ERROR_FILE_NOT_FOUND`, `ERROR_ALREADY_EXISTS` | `0`, `2`, `183`                                                      |
| `SPI_GETDESKWALLPAPER`, `SPI_SETDESKWALLPAPER`                  | `0x73`, `0x14`                                                       |
| `SPIF_UPDATEINIFILE`, `SPIF_SENDCHANGE`                         | `1`, `2`                                                             |
| `MB_OK`, `MB_ICONERROR`, `MB_ICONINFORMATION`                   | `0`, `0x10`, `0x40`                                                  |
| `MAX_PATH`                                                      | `260`                                                                |

### Auxiliares

| Exportação               | Descrição                                                                              |
| ------------------------ | -------------------------------------------------------------------------------------- |
| `lastError()`            | `GetLastError()` capturado logo após a última chamada FFI (reexportado de `nona:ffi`). |
| `wideString(text)`       | Um `Uint16Array` terminado em NUL para parâmetros `buf` que esperam uma string UTF-16. |
| `fromWideString(buffer)` | Decodifica um buffer UTF-16 terminado em NUL.                                          |
| `readHandle(buffer)`     | Lê um handle (por exemplo, um `HKEY`) que uma função gravou em um buffer de 8 bytes.   |

Para funções que não estão na lista, declare-as você mesmo com `define` de [`nona:ffi`](/pt/reference/ffi).

## `node:buffer`, `buffer`, `nona:buffer`

Os aliases exportam os construtores globais `Buffer`, `Blob` e `File`, validadores de bytes, utilitários de base64, transcodificação, configurações de inspeção e constantes. Streams de bytes e de texto de Blob, leitores BYOB e o registro e a resolução de URLs de objeto estão disponíveis. A análise geral de URLs é feita pelo [`URL`](/pt/reference/host-apis#url) global; a construção arbitrária de Web Streams continua sendo uma API de dependência separada. Veja [dados binários (em inglês)](/reference/host-apis#buffer-and-binary-data) e o [exemplo executável](https://github.com/40oleg/nona/blob/main/site/samples/buffer.mjs).
