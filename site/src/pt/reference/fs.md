# Sistema de arquivos (`nona:fs`, `node:fs`)

::: info Tradução
Esta página é uma tradução da página em inglês [File system](/reference/fs), gerada a partir de [`docs/fs.md`](https://github.com/40oleg/nona/blob/main/docs/fs.md). A versão em inglês é a de referência e pode ser mais recente.
:::

Um subconjunto síncrono do módulo `fs` do Node.js vem embutido, com formas de callback e de promessa das funções comuns por cima dele. Os dois especificadores levam à mesma implementação; `import fs from 'node:fs'`, importações nomeadas e `require('fs')` funcionam.

| Função                                                                    | Observações                                                                                                                                                                                                                                |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `readFileSync(path, options?)`                                            | Sem codificação, retorna um `Uint8Array` (o Node.js retorna um `Buffer`); com `'utf8'`, retorna uma string.                                                                                                                                |
| `writeFileSync(path, data, options?)`                                     | `data`: string (UTF-8), typed array, DataView ou ArrayBuffer. `{flag: 'a'}` acrescenta ao final. `flag`: `w` / `a` / `wx`; POSIX `mode`.                                                                                                   |
| `appendFileSync(path, data)`                                              |                                                                                                                                                                                                                                            |
| `existsSync(path)`                                                        |                                                                                                                                                                                                                                            |
| `accessSync(path, mode?)`                                                 | Lança `ENOENT` quando o caminho não existe; os bits de permissão não são verificados.                                                                                                                                                      |
| `statSync(path, options?)`                                                | `isFile()`, `isDirectory()`, `isSymbolicLink()`, `isBlockDevice()`, `isCharacterDevice()`, `isFIFO()`, `isSocket()`, `size`, `mtimeMs`, `mtime`, `mode`; `{throwIfNoEntry: false}`. `dev`, `ino`; `{bigint: true}` → BigInt `dev` / `ino`. |
| `lstatSync(path, options?)`                                               | Como `statSync`, mas para o próprio link e não para o seu destino; `{throwIfNoEntry: false}`. No Windows, links simbólicos e junções são links.                                                                                            |
| `readlinkSync(path)`                                                      | Destino de um link simbólico (ou junção do Windows) como armazenado; `EINVAL` para outros arquivos.                                                                                                                                        |
| `realpathSync(path)`, `realpathSync.native(path)`                         | Caminho absoluto canônico com links simbólicos resolvidos.                                                                                                                                                                                 |
| `readdirSync(path, options?)`                                             | Nomes sem `.` e `..`; `{withFileTypes: true}` retorna objetos `fs.Dirent` com `name`, `parentPath`, `path` e os métodos `is*()` de `Stats`.                                                                                                |
| `mkdirSync(path, {recursive}?)`                                           | Com `recursive`, retorna o primeiro diretório criado.                                                                                                                                                                                      |
| `rmSync(path, {recursive, force}?)`                                       | Remove um arquivo, ou uma árvore de diretórios com `recursive`; `force` ignora um caminho inexistente.                                                                                                                                     |
| `rmdirSync`, `unlinkSync`, `renameSync`, `copyFileSync(src, dest, mode?)` | `constants.COPYFILE_EXCL` é suportado.                                                                                                                                                                                                     |

Os caminhos são strings (ou `Uint8Array` em UTF-8). Apenas a codificação `utf8` é suportada. Os erros são objetos `Error` com códigos do Node.js (`ENOENT`, `EEXIST`, `EISDIR`, `ENOTDIR`, `ENOTEMPTY`, `EACCES`, `EPERM`, …), `syscall` e `path`, e com o mesmo formato de mensagem do Node.js (no Windows, o Node.js mostra o caminho absoluto nas mensagens; o Nona mostra o caminho como foi passado).

Implementação: no Windows, o módulo chama o KERNEL32 (`CreateFileW`, `ReadFile`, `FindFirstFileW`, …) via [`nona:ffi`](/pt/reference/ffi); no Linux, usa chamadas de sistema diretas declaradas com `define('syscall', number, signature)`. Apenas as funções da plataforma para a qual se compila são ligadas.

## Callbacks e promessas

`readFile`, `writeFile`, `appendFile`, `access`, `stat`, `lstat`, `readlink`, `realpath` (com `realpath.native`), `readdir`, `mkdir`, `mkdtemp`, `rm`, `rmdir`, `unlink`, `rename`, `truncate`, `copyFile`, `symlink`, `chmod`, `utimes` e `exists` aceitam um callback no estilo do Node.js (`(error, result)`; `exists` passa apenas um booleano). As mesmas funções sem `exists` retornam promessas de `fs.promises` e do módulo `node:fs/promises` (`fs/promises`, `nona:fs/promises`), que é o mesmo objeto que `fs.promises`. Ambas as formas executam a operação síncrona na chamada e apenas adiam o callback para um tick posterior ou resolvem a promessa: não sobrepõem o trabalho no sistema de arquivos a outro código.

## TextEncoder e TextDecoder {#textencoder-and-textdecoder}

`TextEncoder` e `TextDecoder` são globais e implementam UTF-8 conforme o padrão WHATWG Encoding: `encode(string)`, `decode(bufferSource)`, as opções `fatal` e `ignoreBOM` e a substituição por U+FFFD de sequências inválidas e surrogates isolados. Outras codificações lançam `RangeError`.

Disponível no Windows, Linux e macOS (x64 e ARM64), FreeBSD e OpenBSD (x64).
