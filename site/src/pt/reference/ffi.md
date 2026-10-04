# Funções nativas (FFI)

::: info Tradução
Esta página é uma tradução da página em inglês [Native functions (FFI)](/reference/ffi), gerada a partir de [`docs/ffi.md`](https://github.com/40oleg/nona/blob/main/docs/ffi.md). A versão em inglês é a de referência e pode ser mais recente.
:::

Programas do Windows podem chamar funções exportadas de qualquer DLL por meio do módulo embutido `nona:ffi`. As declarações são resolvidas em tempo de compilação: cada chamada a `define` adiciona uma entrada à tabela de importação PE, então o programa não usa `LoadLibrary`/`GetProcAddress`.

```js
import { define, lastError } from 'nona:ffi';

const MessageBoxW = define('user32.dll', 'MessageBoxW', 'i32(ptr,wstr,wstr,u32)');
MessageBoxW(null, 'Hello from Nona', 'Nona', 0);
```

- O FFI está disponível em código de módulo (`.mjs` ou `--module`). `define` precisa ser chamado diretamente, com três literais de string: o nome da DLL, o nome da exportação e a assinatura. Qualquer outra forma é um erro de compilação (`E_FFI_STATIC`).
- Declarações de DLL são rejeitadas com `--target linux-x64` (`E_FFI_TARGET`).
- No Linux, `define('syscall', '<number>', signature)` declara uma chamada de sistema direta (no máximo seis argumentos inteiros ou `buf`; o resultado é o valor bruto retornado pelo kernel, `errno` negativo em caso de falha). Declarações de chamadas de sistema são rejeitadas para `win32-x64`.
- `lastError()` retorna `GetLastError()` capturado imediatamente após a última chamada FFI.
- Se uma DLL ou exportação estiver faltando, o carregador do Windows se recusa a iniciar o programa.

## Assinaturas {#signatures}

`result(param, param, ...)`, por exemplo `bool(u32,u32,wstr,u32)`.

| Tipo | Parâmetro | Resultado |
| --- | --- | --- |
| `i8 i16 i32 i64 u8 u16 u32 u64` | Number (truncado em direção a zero) ou Boolean | Number |
| `ptr` | Number, Boolean, `null`/`undefined` (NULL) | Number |
| `bool` | como `i32` | Boolean (`BOOL` do Win32, diferente de zero é `true`) |
| `f32 f64` | Number | Number |
| `wstr` | String → cópia temporária UTF-16 terminada em NUL; `null`/`undefined` → NULL | — |
| `str` | String → cópia temporária UTF-8 terminada em NUL; `null`/`undefined` → NULL | — |
| `buf` | ArrayBuffer, SharedArrayBuffer, typed array ou DataView → ponteiro para seus bytes (no deslocamento da view); `null`/`undefined` → NULL | — |
| `void` | — | `undefined` |

Argumentos de outros tipos lançam `TypeError`; o mesmo vale para argumentos ausentes (exceto em tipos ponteiro, em que `undefined` significa NULL) e buffers desanexados. A função chamada pode escrever na memória `buf`, que é como os parâmetros de saída são retornados: passe um `Uint16Array` para um buffer de string UTF-16 ou um `Uint8Array(8)` para um handle. As cópias temporárias de strings são liberadas após a chamada; a função chamada não deve guardar o ponteiro. Callbacks (`cb(...)`) e tipos de parâmetro de saída estão reservados para uma versão futura.

## `nona:win32` {#nona-win32}

Um conjunto selecionado de declarações e auxiliares construído sobre `nona:ffi`:

- user32: `MessageBoxW`, `GetSystemMetrics`, `SystemParametersInfoW` (parâmetro de string), `SystemParametersInfoBufferW` (parâmetro de buffer);
- kernel32: `CreateMutexW`, `ReleaseMutex`, `CloseHandle`, `GetModuleFileNameW`, `GetCurrentProcessId`;
- advapi32: `RegCreateKeyExW`, `RegOpenKeyExW`, `RegSetValueExW`, `RegQueryValueExW`, `RegDeleteValueW`, `RegDeleteKeyW`, `RegCloseKey`;
- constantes como `HKEY_CURRENT_USER`, `KEY_ALL_ACCESS`, `REG_SZ`, `SPI_SETDESKWALLPAPER`, `SPIF_UPDATEINIFILE`, `ERROR_ALREADY_EXISTS`;
- os auxiliares `wideString(text)` (`Uint16Array` terminado em NUL), `fromWideString(buffer)` e `readHandle(buffer)`; `lastError` é reexportado.

```js
import { SystemParametersInfoW, SPI_SETDESKWALLPAPER, SPIF_UPDATEINIFILE, SPIF_SENDCHANGE } from 'nona:win32';
SystemParametersInfoW(SPI_SETDESKWALLPAPER, 0, 'C:\\Pictures\\painting.jpg', SPIF_UPDATEINIFILE | SPIF_SENDCHANGE);
```


## Native target availability

Windows/Linux x64 and ARM64, Intel macOS and FreeBSD/OpenBSD x64 targets are available. Apple Silicon startup is not enabled. See the [native platform matrix](/reference/native-platforms) for target names, host API limits and native verification. DLL FFI requires Windows; raw syscall FFI uses Linux, Darwin or BSD kernel numbers.
