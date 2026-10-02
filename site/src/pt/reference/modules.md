# Módulos embutidos e globais

Os programas Nona rodam sem Node.js. As APIs do host abaixo fazem parte do compilador: o runtime nativo e pequenos prelúdios JavaScript são compilados em cada executável, e os módulos embutidos são compilados quando um programa os importa.

## Visão geral

| API | Tipo | Alvos | Referência |
| --- | --- | --- | --- |
| `setTimeout`, `setInterval`, `clearTimeout`, `clearInterval`, `queueMicrotask`, `performance.now()` | globais | ambos | [Timers e o loop de eventos](/pt/reference/host-apis) |
| `process` | global | ambos | [process](/pt/reference/process) |
| `TextEncoder`, `TextDecoder` | globais | ambos | [Sistema de arquivos e codificação de texto](/pt/reference/fs#textencoder-and-textdecoder) |
| `console.log` | global | ambos | escreve UTF-8 na saída padrão |
| `nona:process`, `node:process` | módulos | ambos | [process](/pt/reference/process) |
| `nona:fs`, `node:fs` | módulos | ambos | [Sistema de arquivos e codificação de texto](/pt/reference/fs) |
| `nona:ffi` | módulo | Windows (DLLs), Linux (chamadas de sistema) | [Funções nativas (FFI)](/pt/reference/ffi) |
| `nona:win32` | módulo | Windows | abaixo e em [FFI](/pt/reference/ffi#nona-win32) |

## Regras

- Os globais estão disponíveis em scripts e módulos.
- Módulos embutidos podem ser importados em código de módulo (`.mjs` ou `--module`) e com `import()` literal em scripts. Declarações FFI (`define`) precisam estar em código de módulo.
- Entre os módulos `node:` existem apenas `node:fs` e `node:process`; são aliases dos subconjuntos do Nona, não as implementações do Node.js. `node:path`, `Buffer` e `require` não estão disponíveis.
- `nona:win32` e declarações de DLL só compilam para `win32-x64`; declarações de chamadas de sistema, só para `linux-x64`.

## `nona:win32` {#nona-win32}

Declarações prontas construídas sobre [`nona:ffi`](/pt/reference/ffi). Cada função é um thunk nativo: os argumentos são convertidos como descrito para os [tipos de assinatura](/pt/reference/ffi#signatures).

### user32

| Exportação | Assinatura |
| --- | --- |
| `MessageBoxW` | `i32(ptr hwnd, wstr text, wstr caption, u32 type)` |
| `GetSystemMetrics` | `i32(i32 index)` |
| `SystemParametersInfoW` | `bool(u32 action, u32 param, wstr value, u32 flags)` — para parâmetros de string como `SPI_SETDESKWALLPAPER` |
| `SystemParametersInfoBufferW` | `bool(u32 action, u32 param, buf value, u32 flags)` — para parâmetros de buffer como `SPI_GETDESKWALLPAPER` |

### kernel32

| Exportação | Assinatura |
| --- | --- |
| `CreateMutexW` | `ptr(ptr attributes, bool initialOwner, wstr name)` |
| `ReleaseMutex` | `bool(ptr mutex)` |
| `CloseHandle` | `bool(ptr handle)` |
| `GetModuleFileNameW` | `u32(ptr module, buf path, u32 size)` |
| `GetCurrentProcessId` | `u32()` |

### advapi32

| Exportação | Assinatura |
| --- | --- |
| `RegCreateKeyExW` | `i32(ptr key, wstr subKey, u32 reserved, ptr class, u32 options, u32 access, ptr security, buf result, buf disposition)` |
| `RegOpenKeyExW` | `i32(ptr key, wstr subKey, u32 options, u32 access, buf result)` |
| `RegSetValueExW` | `i32(ptr key, wstr name, u32 reserved, u32 type, buf data, u32 size)` |
| `RegQueryValueExW` | `i32(ptr key, wstr name, ptr reserved, buf type, buf data, buf size)` |
| `RegDeleteValueW` | `i32(ptr key, wstr name)` |
| `RegDeleteKeyW` | `i32(ptr key, wstr subKey)` |
| `RegCloseKey` | `i32(ptr key)` |

### Constantes

| Exportação | Valor |
| --- | --- |
| `HKEY_CLASSES_ROOT`, `HKEY_CURRENT_USER`, `HKEY_LOCAL_MACHINE` | chaves predefinidas do registro (como handles com extensão de sinal) |
| `KEY_READ`, `KEY_WRITE`, `KEY_ALL_ACCESS` | `0x20019`, `0x20006`, `0xF003F` |
| `REG_SZ`, `REG_DWORD` | `1`, `4` |
| `ERROR_SUCCESS`, `ERROR_FILE_NOT_FOUND`, `ERROR_ALREADY_EXISTS` | `0`, `2`, `183` |
| `SPI_GETDESKWALLPAPER`, `SPI_SETDESKWALLPAPER` | `0x73`, `0x14` |
| `SPIF_UPDATEINIFILE`, `SPIF_SENDCHANGE` | `1`, `2` |
| `MB_OK`, `MB_ICONERROR`, `MB_ICONINFORMATION` | `0`, `0x10`, `0x40` |
| `MAX_PATH` | `260` |

### Auxiliares

| Exportação | Descrição |
| --- | --- |
| `lastError()` | `GetLastError()` capturado logo após a última chamada FFI (reexportado de `nona:ffi`). |
| `wideString(text)` | Um `Uint16Array` terminado em NUL para parâmetros `buf` que esperam uma string UTF-16. |
| `fromWideString(buffer)` | Decodifica um buffer UTF-16 terminado em NUL. |
| `readHandle(buffer)` | Lê um handle (por exemplo, um `HKEY`) que uma função gravou em um buffer de 8 bytes. |

Para funções que não estão na lista, declare-as você mesmo com `define` de [`nona:ffi`](/pt/reference/ffi).
