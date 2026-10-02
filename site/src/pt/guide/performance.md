# Desempenho: Nona comparado a Node.js, Deno e Bun

::: info Tradução
Esta página é uma tradução da página em inglês [Performance](/guide/performance), gerada a partir de [`PERFORMANCE.md`](https://github.com/40oleg/nona/blob/main/PERFORMANCE.md). A versão em inglês é a de referência e pode ser mais recente. `node bench/run.mjs` reproduz as medições.
:::

Medido em 2026-10-01 com o Nona `v0.7.0` (commit `b31c4d6`). Os scripts ficam em [`bench/`](https://github.com/40oleg/nona/blob/main/bench/); `node bench/run.mjs` reproduz todas as tabelas abaixo.

## Resumo

O Nona vence em tudo o que acontece antes e ao redor do programa: um hello world compilado inicia em **1,8 ms** (Bun 4,5, Deno 15, Node 28), o executável tem **7 MB** (81–124 MB com `bun --compile`, `deno compile` e Node SEA) e o pico de RSS é de **11 MB**, enquanto o Node precisa de 45 MB.

Dentro do programa, o quadro se inverte. A computação comum — chamadas de função, closures, classes, typed arrays, alocação — é **de 20 a 100 vezes mais lenta** que no V8/JavaScriptCore, que é a diferença esperada entre um compilador AOT sem inline caches nem feedback de tipos e um JIT. Várias operações básicas não são apenas mais lentas, mas **superlineares em relação ao tamanho dos dados**, e é isso que faz programas reais falharem em vez de apenas ficarem lentos:

| Operação | Nona com 10k | Nona com 100k | Crescimento | Node com 100k |
| --- | --- | --- | --- | --- |
| `Map.set` × N | 0.83 s | 92.7 s | ×111 (quadrático) | 14 ms |
| `Set.add` + `Set.has` × N | 1.7 s | 182 s | ×107 (quadrático) | 12 ms |
| `sort()` de N números | 1.3 s | 20.4 s | ×16 (quadrático) | 39 ms |
| Cadeia de Promise com N `.then` | 363 s | > 10 min | ×145 de 1k para 10k | 7 ms |
| `JSON.stringify`, N objetos | 1.4 s, 1.7 GB RSS | > 10 min | — | 1.6 ms |
| `s += "abc" + i` × N | 0.88 s (10k) | — | ×20 de 2k para 10k | 0.3 ms |
| `readFileSync(..., "utf8")` | 0.37 s (1 MB) | 25 s (10 MB) | ×68 para ×10 | 25 ms |

O autor documenta a causa raiz do primeiro grupo: o armazenamento de propriedades, elementos e `Map` é uma busca linear (issue #36). Strings são buffers UTF-16 imutáveis copiados a cada concatenação, e `Array.prototype.join`, `JSON.stringify` e a fila de jobs de Promise são construídos sobre essas duas primitivas.

## Ambiente e método

| Participante | Versão | Comando |
| --- | --- | --- |
| Nona | 0.7.0 | `node dist/cli.js build x.js -o x --target linux-x64`, depois `./x` |
| Node.js | 22.22.0 | `node x.js` |
| Deno | 2.9.6 | `deno run -A x.js` |
| Bun | 1.4.2 | `bun x.js` |

Linux x86-64, Intel Xeon 2,10 GHz, 2 vCPUs, 7 GB de RAM (sandbox na nuvem). O mesmo arquivo-fonte é executado pelos quatro. Cada script cronometra suas fases com `performance.now()` e as imprime como JSON; o tempo total e o pico de RSS vêm do harness. Os números são medianas de 5 execuções (runtimes) ou de 3–5 execuções (Nona); a variação do Nona entre execuções é inferior a 5 %. Cada script lê `SCALE` do ambiente, então "N = 100k" significa `SCALE=0.1` do 1M nominal. A inicialização é medida com `hyperfine` (30 execuções, 5 de aquecimento). O Nona só compila ES2020 com um subconjunto síncrono de `fs` e sem npm, então os scripts ficam dentro desse subconjunto (`import fs from "node:fs"` em vez de `require`).

Quando o Nona não terminou um tamanho em 10 minutos, a célula informa isso; as colunas dos outros runtimes nesse tamanho continuam sendo medições reais.

## 1–4. Inicialização, tamanho do executável, tempo de build, memória

| Como o programa roda | Inicialização, hello world (ms, mediana de 30) | Executável (MB) | Compilar hello world para exe (s) | Pico de RSS, hello world (MB) |
| --- | --- | --- | --- | --- |
| Nona, ELF compilado | **1.8** | **7.3** | 2.7 | **11.5** |
| Bun, `bun build --compile` | 3.2 | 81.3 | **0.25** | 14.5 |
| Bun, `bun x.js` | 4.5 | 79.5 (o próprio runtime) | — | 13.1 |
| Deno, `deno compile` | 12.1 | 104.3 | 0.70 | 33.0 |
| Deno, `deno run x.js` | 15.0 | 95.6 (o próprio runtime) | — | 28.3 |
| Node, SEA via postject | 24.9 | 123.5 | 7.7 | 58.3 |
| Node, `node x.js` | 27.6 | 123.4 (o próprio runtime) | — | 45.5 |

O tempo de build do Nona quase não depende do programa (2,7 s para hello world, 3,0 s para o teste de matrizes/BigInt): a maior parte é a compilação do runtime e dos prelúdios JavaScript que entram em cada executável.

Pico de RSS sob carga, scripts em tamanho completo (MB):

| Script | Node | Deno | Bun | Nona |
| --- | --- | --- | --- | --- |
| 09 — 5M objetos de vida curta | 53 | 44 | 29 | **11** |
| 13 — `Float64Array` 10M | 204 | 198 | 181 | 157 |
| 15 — classes, 1M `new Square` | 129 | 124 | 77 | 777 |
| 14 — chamadas, 1M closures | 188 | 214 | 120 | 1 993 |
| 11 — JSON, 3k objetos (escala N = 10k) | 74 | 63 | 48 | 1 732 |

O coletor mark-and-sweep mantém minúsculas as cargas que só geram lixo, mas qualquer carga que mantenha um milhão de closures ou objetos vivos, ou que construa strings, incha muito além dos runtimes com JIT.

## 5–7. Arrays, objetos e Map/Set, strings e RegExp

N = 100 000, mediana, ms:

| Operação | Node | Deno | Bun | Nona | Nona / Node |
| --- | --- | --- | --- | --- | --- |
| `push` × N | 5.2 | 6.0 | 3.4 | 192 | ×37 |
| `Array.from({length: N})` | 5.1 | 4.9 | 3.1 | 183 | ×36 |
| `new Array(N)` + preenchimento | 1.9 | 1.3 | 1.5 | 276 | ×143 |
| Soma com um laço `for` | 1.5 | 1.9 | 0.6 | 27 | ×18 |
| `map` → `filter` → `reduce` | 4.4 | 4.2 | 4.0 | 119 | ×27 |
| `sort` de N números com comparador | 39 | 40 | 31 | 20 400 | ×523 |
| Criar N objetos `{id, x, y, name}` | 14.1 | 11.9 | 9.7 | 468 | ×33 |
| Ler 3 propriedades × N | 6.8 | 7.4 | 1.2 | 62 | ×9 |
| `Map.set` × N | 13.8 | 14.4 | 18.4 | 92 700 | ×6 700 |
| `Map.get` × N | 5.1 | 5.3 | 5.1 | 90 700 | ×18 000 |
| `Set.add` + `Set.has` × N | 12.2 | 9.7 | 15.2 | 182 500 | ×15 000 |

Com o N = 1M nominal, Node/Deno/Bun executam o script inteiro de arrays em 0,4–0,9 s e o de objetos em 0,5–0,6 s. O Nona ordenou 1M números em 278 s numa primeira execução; o script completo de objetos não terminou em 10 minutos.

As strings são medidas com N = 10 000 porque, com 100 000, o binário do Nona foi encerrado pelo kernel após 30 s com 6 GB de RSS: `Array.prototype.join` sobre 20k partes constrói strings intermediárias e sua memória cresce quadraticamente (4k partes → 450 MB). `s += …` é quadrático no tempo (2k iterações → 43 ms, 10k → 881 ms); o motor de RegExp é linear, mas gasta cerca de 0,5 ms por caractere.

| Operação (N = 10 000) | Node | Deno | Bun | Nona | Nona / Node |
| --- | --- | --- | --- | --- | --- |
| `s += "abc" + i` × 2 000 | 0.29 | 0.49 | 0.89 | 45 | ×156 |
| `split("1")` + `join("-")` | 0.12 | 0.14 | 0.29 | 56 | ×470 |
| `indexOf` em um laço | 0.02 | 0.02 | 0.02 | 0.06 | ×3 |
| `/abc(\d{3})-/g.exec` em um laço | 0.06 | 0.07 | 0.10 | 794 | ×13 000 |

Com um N tão pequeno, os números de Node/Deno/Bun são principalmente aquecimento do JIT, então as razões desta tabela tendem a estar subestimadas, e não superestimadas.

## 8–10. Cálculo numérico, pressão sobre o GC, async

| Operação | Tamanho | Node | Deno | Bun | Nona | Nona / Node |
| --- | --- | --- | --- | --- | --- | --- |
| `fib(32)` recursivo | — | 23 | 24.5 | 18.3 | 568 | ×25 |
| Multiplicação de matrizes 200×200, arrays aninhados | — | 30 | 35.6 | 36.6 | 25 700 | ×857 |
| Fatorial BigInt 30! | 30 | 0.17 | 0.11 | 0.22 | 0.25 | ×1.5 |
| Fatorial BigInt 300! | 300 | 0.20 | 0.28 | 0.37 | 2 340 | ×11 700 |
| Fatorial BigInt 3000! | 3000 | 3.8 | 3.1 | 3.8 | > 10 min | — |
| 500k `{a, b: [..], c: {..}}` de vida curta | 500k | 19.7 | 15.6 | 27.2 | 1 840 | ×93 |
| 5M objetos de vida curta | 5M | 94.6 | 98.1 | 156 | 20 100 | ×213 |
| Cadeia de Promise, `.then` × 10 000 | 10k | 6.8 | 4.1 | 2.9 | 363 000 | ×53 000 |
| `setTimeout(fn, 0)` × 100, sequencial | 100 | 117 | 221 | 114 | 123 | ×1.0 |

O `fib(32)` recursivo é o melhor resultado computacional do Nona (×25), mais ou menos onde fica um interpretador sem JIT. A multiplicação de matrizes lê `A[i][k]` 8 milhões de vezes através do armazenamento linear de elementos. A multiplicação de BigInt se degrada com o tamanho dos operandos: 30! empata com o Node, 300! leva 2,3 s e 3000! não terminou.

A cadeia de Promise é o segundo precipício depois das coleções: 1 000 `.then` levam 2,6 s, 4 000 levam 40 s e 10 000 levam 363 s — pior que quadrático, compatível com a fila de jobs sendo percorrida desde o início a cada job. Os timers vão bem: `setTimeout(fn, 0)` custa cerca de 1,2 ms em todos, porque todo runtime limita o atraso a no mínimo 1 ms.

## 11–13. JSON, E/S de arquivos, typed arrays

| Operação | Tamanho | Node | Deno | Bun | Nona | Nona / Node |
| --- | --- | --- | --- | --- | --- | --- |
| `JSON.stringify` | 3 000 objetos, 280 KB | 1.6 | 1.1 | 1.1 | 1 400 | ×900 |
| `JSON.parse` | 280 KB | 3.8 | 2.1 | 3.7 | 173 | ×45 |
| `appendFileSync` × 10 | 10 MB | 5.9 | 12.0 | 3.3 | 4 530 | ×770 |
| `readFileSync(path, "utf8")` | 10 MB | 25.2 | 26.8 | 6.0 | 25 200 | ×1 000 |
| `Float64Array`: preenchimento, soma, map | 1M | 21.1 | 17.1 | 16.2 | 360 | ×17 |
| `Float64Array`: preenchimento, soma, map | 10M | 159 | 132 | 115 | 3 240 | ×20 |

Os typed arrays são o único teste de dados em que o Nona fica dentro de uma ordem de grandeza e escala linearmente. JSON e arquivos esbarram na mesma construção quadrática de strings: `JSON.stringify` de 3 000 objetos leva 1,4 s e usa 1,7 GB; o cenário completo de 300k objetos / 30 MB e o arquivo de 100 MB não terminaram em 10 minutos, enquanto Node, Deno e Bun levam 0,1–0,7 s.

## 14–15. Chamadas de função, closures, classes

| Operação | N = 100k | | | | | N = 1M | |
| --- | --- | --- | --- | --- | --- | --- | --- |
| | Node | Deno | Bun | Nona | Nona / Node | Node | Nona |
| Chamar `add(a, b)` × 10N | 5.3 | 7.6 | 6.1 | 375 | ×71 | 10.9 | 3 590 |
| Criar e chamar N closures | 21.3 | 18.1 | 20.6 | 872 | ×41 | 256 | 12 000 |
| `call` + `apply` × 4N | 9.1 | 10.8 | 5.2 | 656 | ×72 | 32.6 | 12 000 |
| Método através de uma cadeia de herança × 5N | 5.3 | 3.7 | 5.8 | 354 | ×67 | 7.6 | 3 710 |
| Chamada polimórfica, 3 classes × 5N | 5.5 | 8.6 | 15.5 | 532 | ×96 | 21.5 | 5 830 |
| `new Square(i)` × N | 14.9 | 9.0 | 13.7 | 774 | ×52 | 112 | 10 560 |

Estas operações escalam linearmente, então a diferença aqui é o custo puro de uma chamada sem JIT: V8 e JavaScriptCore fazem inline de `add(s, i)` e armazenam em cache a busca do método no ponto de chamada, enquanto o Nona segue sempre o caminho genérico com uma busca na cadeia de protótipos. `apply` com um array novo a cada chamada é a exceção que cresce mais rápido que o linear (×72 com 100k, ×369 com 1M), assim como `new` com um milhão de instâncias vivas (777 MB de RSS).

## Para onde vai o tempo

Agrupando as razões em relação ao Node por causa:

1. **Armazenamento linear de propriedades/elementos/Map** (issue #36): `Map`/`Set` ×7 000–18 000, `sort` ×523, multiplicação de matrizes ×857, `new Array(N)` ×143. Corrigir as estruturas de dados reduz esses casos ao ~×30 do código ao redor.
2. **Cópia de strings**: concatenação ×156, `join` ×470 com memória quadrática, `JSON.stringify` ×900, `readFileSync` utf8 ×1 000, `appendFileSync` ×770. Uma representação em rope ou builder, junto com transcodificação UTF-8/UTF-16 em bloco, resolve tudo isso de uma vez.
3. **Fila de jobs de Promise** ×53 000 e **multiplicação de BigInt** ×11 700 com 300 dígitos: ambos são algorítmicos, independentes da geração de código.
4. **VM de RegExp** ×13 000: um interpretador de bytecode escrito em JavaScript e compilado pelo próprio Nona, que por isso paga o custo de chamada ×30 a cada instrução.
5. **Sem JIT**: chamadas ×70, closures ×41, classes ×50–100, alocação ×93–213, `fib` ×25, typed arrays ×17–20, percurso de arrays ×18–37. As respostas usuais em um contexto AOT são inline caches, acesso a propriedades baseado em shapes e aritmética com números sem boxing.
