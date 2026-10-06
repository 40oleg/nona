# Museum: trocador de papel de parede <Badge type="warning" text="Somente Windows" />

::: warning Somente Windows
Este exemplo chama funções do Windows através de `nona:win32` e só compila para `win32-x64`.
:::

O Museum é um programa em segundo plano que mostra uma pintura diferente como papel de parede a cada poucos minutos. Ele roda sem janela de console, não usa CPU entre as trocas, só permite uma instância e pode se registrar para iniciar com o Windows. O programa inteiro é um único módulo de cerca de 80 linhas.

## Passo 1: argumentos

```js
const folder = process.argv[1];
const minutes = Number(process.argv[2] ?? 30);
const install = process.argv.includes('--install');
```

`process.argv[0]` é o executável e `process.argv[1]` o primeiro argumento. Um programa gráfico não tem console, então os erros são mostrados com `MessageBoxW`:

```js
function fail(message) {
  MessageBoxW(null, message, 'Museum', MB_OK | MB_ICONERROR);
  process.exit(1);
}
```

## Passo 2: as imagens

`readdirSync` from `node:fs` lists the folder. This sample joins paths with `\\`; `node:path` is also available.

```js
const pictures = readdirSync(folder)
  .filter(name => /\.(jpe?g|png|bmp)$/i.test(name))
  .sort()
  .map(name => folder.replace(/[\\/]+$/, '') + '\\' + name);
```

## Passo 3: uma única instância

Um mutex nomeado existe enquanto o processo que o criou estiver vivo. Se ele já existe, outro Museum está rodando.

```js
CreateMutexW(null, false, 'Local\\NonaMuseum');
if (lastError() === ERROR_ALREADY_EXISTS) process.exit(0);
```

`lastError()` retorna `GetLastError()` capturado logo após a chamada FFI anterior.

## Passo 4: definir o papel de parede

```js
SystemParametersInfoW(SPI_SETDESKWALLPAPER, 0, picture, SPIF_UPDATEINIFILE | SPIF_SENDCHANGE)
```

O parâmetro `wstr` transforma a string JavaScript em uma cópia UTF-16 temporária terminada em NUL, então caminhos com quaisquer caracteres funcionam. `SPIF_UPDATEINIFILE` mantém o papel de parede depois de sair da sessão e `SPIF_SENDCHANGE` avisa os outros programas.

## Passo 5: rotação

```js
showNext();
setInterval(showNext, minutes * 60 * 1000);
```

Um intervalo pendente mantém o processo vivo. Entre os ticks, o loop de eventos dorme no kernel, então o programa não usa CPU enquanto espera.

## Passo 6: compilar um programa gráfico

<<< ../../../samples/museum.version.json

```sh
node dist/cli.js build museum.mjs -o build/museum.exe --subsystem windows --icon museum.ico --version-info museum.version.json
```

- `--subsystem windows` inicia o programa sem janela de console e incorpora um manifesto padrão (asInvoker, Windows 10/11, reconhecimento de DPI por monitor).
- `--icon` incorpora o ícone que o Explorer e a barra de tarefas mostram.
- `--version-info` preenche Propriedades → Detalhes.

Execute-o com uma pasta e um intervalo em minutos:

```powershell
.\build\museum.exe "C:\Users\me\Pictures\Paintings" 30
```

## Passo 7: iniciar com o Windows (opcional)

Com `--install`, o Museum grava sua linha de comando em `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`. `RegCreateKeyExW` grava a chave aberta em um buffer de 8 bytes, que `readHandle` lê; `wideString` gera os dados UTF-16 para `RegSetValueExW`.

```js
const key = new Uint8Array(8);
RegCreateKeyExW(HKEY_CURRENT_USER, runKey, 0, null, 0, KEY_WRITE, null, key, null);
const command = wideString(`"${process.execPath}" "${folder}" ${minutes}`);
RegSetValueExW(readHandle(key), 'NonaMuseum', 0, REG_SZ, command, command.byteLength);
```

Para desfazer, apague o valor `NonaMuseum` dessa chave (por exemplo, com `RegDeleteValueW` ou no Editor do Registro).

## Código-fonte completo

<<< ../../../samples/museum.win32.mjs{js}

## Veja também

- [Funções nativas (FFI)](/pt/reference/ffi) e a [lista de exportações de `nona:win32`](/pt/reference/modules#nona-win32)
- [Executáveis do Windows](/pt/reference/windows-executables)
- [Timers e o loop de eventos](/pt/reference/host-apis)
