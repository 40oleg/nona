# Linha de base do Test262

::: info Tradução
Esta página é uma tradução da página em inglês [Test262 baseline](/reference/test262), gerada a partir de [`docs/test262.md`](https://github.com/40oleg/nona/blob/main/docs/test262.md). A versão em inglês é a de referência e pode ser mais recente.
:::

O runner usa a revisão do Test262 upstream `7ab7fafa0003f73fc85c1b95d88094d33f7eb8bd`. Ele intencionalmente não inclui uma cópia do Test262 neste repositório. No Windows x64:

```powershell
git clone --depth 1 --filter=blob:none --sparse https://github.com/tc39/test262.git work/test262
git -C work/test262 sparse-checkout set harness test/language/expressions/coalesce test/language/expressions/arrow-function test/language/expressions/array test/language/expressions/call test/language/expressions/new test/language/expressions/template-literal test/language/rest-parameters test/language/statements/function test/language/statements/for-in test/language/statements/for-of test/built-ins/Symbol test/built-ins/Array/prototype/includes test/built-ins/Array/prototype/pop test/built-ins/Math/pow test/built-ins/Math/min test/built-ins/Math/max test/built-ins/Math/abs test/built-ins/Math/sign test/built-ins/Math/sqrt test/built-ins/Math/trunc test/built-ins/Math/floor test/built-ins/Math/ceil test/built-ins/Math/round test/built-ins/String/prototype/includes test/built-ins/Number/isFinite test/built-ins/Number/isInteger test/built-ins/Number/isNaN test/built-ins/Number/isSafeInteger
git -C work/test262 rev-parse HEAD
git -C work/test262 sparse-checkout add test/built-ins/Math/imul test/built-ins/Math/clz32
npm ci
npm run test262:smoke
node scripts/test262-smoke.mjs language/expressions/coalesce
```

O mesmo runner também funciona no Linux x64: nesse caso ele compila imagens ELF `linux-x64` em vez de arquivos PE e tenta de novo quando ocorre a condição de corrida transitória `ETXTBSY` no exec, que as worker threads podem causar no Linux. Defina `TEST262_DELETE_BINARIES=1` para remover cada imagem de teste compilada depois de executá-la; caso contrário, catálogos grandes deixam vários gigabytes em `work/test262-smoke`.

O checkout precisa estar na revisão fixada. Se o HEAD upstream avançou, faça fetch/checkout desse commit exato antes de executar. `TEST262_ROOT` seleciona outro checkout e `TEST262_REPORT` outro caminho para o relatório JSON. `TEST262_JOBS` executa até oito worker threads em paralelo (o padrão é uma) e preserva a ordem do relatório. Por exemplo, defina `TEST262_JOBS=4` antes de executar um catálogo grande. `TEST262_PATH_FILTER` inclui os caminhos correspondentes; `TEST262_EXCLUDE_PATH_FILTER` os omite. Ambos são filtros de substring literal. O comando sem argumentos executa o manifesto revisado em `tests/test262-smoke.json`; um argumento com diretório relativo executa todos os arquivos `.js` sob esse grupo do Test262. Os relatórios distinguem falhas de compilação, falhas em tempo de execução e testes ignorados.

## Auditorias completas

`scripts/test262-audit.ps1` (Windows) e `scripts/test262-audit.sh` (Linux) executam cada diretório do Test262 em `language/`, `annexB/` e `built-ins/` com `TEST262_EXCLUDE_FEATURES=post-es2020`, um relatório por diretório em `work/test262-audit` (retomável). `-Dirs 'a,b' -Tag r1` (PowerShell) ou `TAG=r1 scripts/test262-audit.sh <out> a b` reexecuta os diretórios selecionados em um subdiretório cujos resultados substituem os da execução completa. Para resumir e classificar:

```
node scripts/test262-summary.mjs work/test262-audit --others work/others.txt
node scripts/test262-summary.mjs work/test262-audit --compare work/previous-audit
```

O resumo classifica cada falha como `eval` (o teste usa eval; como o código de eval é compilado antecipadamente, trata-se principalmente de código calculado em tempo de execução, `$262.evalScript` ou outros realms), `post` (semântica posterior ao ES2020 sob uma tag de recurso antiga ou ausente) ou `other`, e lista os arquivos `other` (`--evals <file>` lista os de eval). `TEST262_FILE_LIST=<file>` restringe uma execução de `scripts/test262-smoke.mjs <group>` aos caminhos listados, por exemplo para reexecutar uma lista dessas. Um checkout sem metadados do git (por exemplo, copiado para outra máquina) é aceito quando `work/test262/.nona-test262-revision` contém o hash do commit fixado; nesse caso, os testes de terminadores de linha leem os arquivos diretamente.

## Semântica posterior ao ES2020 no Test262 fixado {#semantics-newer-than-es2020-in-the-pinned-test262}

O Test262 fixado (2026) às vezes verifica comportamento introduzido depois do ES2020 sem uma tag de recurso pós-ES2020. Política (issue #17): quando uma edição posterior apenas removeu uma peculiaridade observável do ES2020 da qual os programas não dependem, o Nona segue o Test262 fixado; todo o resto permanece no ES2020 e é classificado como `post` por `scripts/test262-summary.mjs` ou listado como desvio conhecido. Casos em que o Test262 é seguido:

- `[[Set]]`, `[[GetOwnProperty]]` e `[[DefineOwnProperty]]` de TypedArray (ES2021/ES2022): o valor é convertido primeiro; depois, um índice inválido ou um buffer desanexado ignora a escrita e reporta sucesso; um buffer desanexado não tem elementos próprios; com um Receiver diferente do TypedArray, um índice inválido não tem efeito e um válido resulta em OrdinarySet no Receiver.
- `String.prototype.{replace,split,match,matchAll,search}` não procuram métodos com chave Symbol em argumentos primitivos (ES2025).
- Alvos de atribuição do Annex B na forma de expressão de chamada lançam ReferenceError em tempo de execução em código não estrito e são early errors em código estrito (realidade da web no ES2022).

Mantido no ES2020 (falhas classificadas como `post`): campos de classe e métodos privados, separadores numéricos, atribuição lógica, `Promise.any`/`AggregateError`, `Error.prototype.stack`/`cause`, flag `v` de RegExp e índices de correspondência, await no nível superior e os demais recursos de `postEs2020Features`. Os desvios conhecidos restantes estão listados por catálogo em `docs/history/pr5-es2020-remaining-work.md` e no status da versão.

Recursos do runner adicionados para o marco do ES2020 (2026-09):

- `TEST262_TARGET=linux-x64` (padrão no Linux) liga imagens ELF; testes de módulos (`flags: [module]`) são compilados como um grafo de módulos com o harness como prelúdio de script clássico; testes negativos de resolução de módulos esperam um erro de compilação.
- `TEST262_EXCLUDE_FEATURES=post-es2020` se expande para a lista de tags de recursos introduzidos depois do ES2020 (veja `postEs2020Features` no script), mais `error-stack-accessor` e a extensão não padrão `caller`.
- `$262.createRealm` é compilado quando o teste o menciona (até três realms); os programas de `$262.agent` são extraídos de templates estáticos (contadores de laço, constantes de nível superior e `$262.agent.timeouts` são dobrados) e compilados na imagem como threads agentes. Os testes `CanBlockIsFalse` são ignorados porque o agente principal pode bloquear.
- Especificadores calculados de `import()` podem carregar os arquivos `_FIXTURE.js` do teste mencionados em seu código-fonte (`ModuleHost.candidates`).
- Uma exceção do compilador é reportada como falha daquele arquivo (`phase: compiler-crash`) em vez de interromper a execução.

Este é um **adaptador de linha de base**, não o harness completo do Test262: testes raw e testes negativos em tempo de execução são ignorados por enquanto, com o motivo registrado. Testes negativos de parsing passam quando o Nona rejeita o código com um diagnóstico do compilador; o adaptador ainda não verifica a equivalência do tipo de diagnóstico. Ele executa testes positivos de script com o harness padrão `sta.js`/`assert.js` e os `includes` declarados. Antes de afirmar conformidade, o adaptador precisa suportar todos os modos de metadados aplicáveis e as duas variantes, estrita e não estrita, e então executar todos os grupos aplicáveis. Nesta fase, os testes nativos comuns do repositório continuam sendo a principal barreira contra regressões. Execute os testes e o oráculo com o Node 26, como exige o `package.json`; o Node 22 difere em metadados de funções observáveis e pode falhar quando um teste sela seu objeto global.

O manifesto smoke positivo de tempo de execução de 2026-09-26 inclui casos de parâmetros padrão e spread; suas contagens atuais estão registradas no log de desenvolvimento. Grupos raw mais amplos na revisão fixada dão 72 pass / 26 fail em `built-ins/Symbol`, 85 pass / 34 fail em `language/statements/for-in` e 142 pass / 607 fail / 2 skip em `language/statements/for-of`. Esses grupos incluem casos fora do subconjunto implementado e casos adicionados depois do ES2020; as contagens raw são diagnósticas, não porcentagens de conformidade com o ES2020. `built-ins/Array/prototype/includes` dá 26 pass / 4 fail / 0 skip; os casos que falham usam Proxy ou ArrayBuffers redimensionáveis. `built-ins/Math/pow` dá 28 pass / 0 fail / 0 skip depois da adição das constantes de Math do ES2020. `built-ins/Math/min` e `built-ins/Math/max` dão cada um 10 pass / 0 fail / 0 skip, incluindo a conversão de cada argumento e a ordenação de zeros com sinal. `built-ins/String/prototype/includes` dá 25 pass / 2 fail / 0 skip; os casos que falham contêm literais RegExp, que ainda não são suportados. `built-ins/String/prototype/padStart` e `padEnd` dão cada um 13 pass / 0 fail / 0 skip, incluindo a ordem de conversão e verificações de descritores. `built-ins/String/prototype/indexOf` dá 44 pass / 3 fail / 0 skip; os casos restantes dependem de `eval` ou BigInt. `built-ins/String/prototype/lastIndexOf` dá 25 pass / 0 fail / 0 skip. `built-ins/String/fromCharCode` dá 16 pass / 1 fail / 0 skip; o caso restante exige BigInt. `built-ins/Array/prototype/indexOf` dá 193 pass / 8 fail / 0 skip, e `lastIndexOf` 189 pass / 9 fail / 0 skip depois da adição do `isNaN` global. Os casos restantes usam Date, RegExp, JSON, Proxy, buffers/typed arrays redimensionáveis ou `eval`. O `isFinite` global dá 15 pass / 0 fail / 0 skip. O `isNaN` global dá 14 pass / 1 fail / 0 skip; o caso restante usa `Array.prototype.forEach` no corpo do harness do teste. `built-ins/Array/prototype/pop` dá 23 pass / 0 fail / 0 skip depois da adição das constantes de Number do ES2020. Os quatro grupos `Number.isFinite/isInteger/isNaN/isSafeInteger` dão 8/9/7/10 pass, respectivamente, sem falhas nem testes ignorados. `language/rest-parameters` dá 11 pass / 0 fail / 0 skip depois de parâmetros desestruturados e métodos de classe. Depois do suporte a parâmetros padrão, `language/expressions/arrow-function` dá 147 pass / 196 fail / 0 skip; todos os 9 casos `dflt-params` desse grupo passam. Com spread em literais de array e de objeto, `language/expressions/array` dá 50 pass / 2 fail / 0 skip. Os dois casos restantes exigem geradores. Com spread em chamadas e construção, `language/expressions/call` dá 72 pass / 20 fail / 0 skip e `language/expressions/new` dá 54 pass / 5 fail / 0 skip. Entre os casos `spread-*`, apenas dois em cada grupo não compilam, porque exigem geradores. As outras falhas dos grupos envolvem recursos não suportados sem relação com isso, incluindo `eval`. Os grupos `Math.abs/sign/sqrt/trunc/floor/ceil/round` passam 8/5/10/12/11/11/11 testes, respectivamente, sem falhas nem testes ignorados. Os grupos `Math.imul` e `Math.clz32` passam 5/5 e 10/10, respectivamente. Depois dos padrões de binding de arrays e objetos, os três grupos de declarações `language/statements/variable/dstr`, `let/dstr` e `const/dstr` passam 79/97, 77/93 e 77/93 casos, respectivamente. Cada caso restante não compila porque usa geradores ou classes. Estes são grupos selecionados do Test262, não uma porcentagem de conformidade com o ES2020. `language/destructuring/binding/syntax` dá 12 pass / 2 fail; os dois casos restantes exigem sintaxe de geradores e async. `language/expressions/assignment/dstr` dá 323 pass / 45 falhas de compilação / 0 falhas em tempo de execução; essas falhas de compilação exigem geradores ou classes. Os grupos de classes selecionados `language/statements/class/method` e `method-static` passam 20/20 cada. `language/statements/class/definition` dá 46 pass / 17 falhas de compilação / 2 skips; os casos restantes exigem sintaxe fora do subconjunto atual de classes, incluindo geradores e métodos async.

Em 2026-09-25, o grupo `language/expressions/coalesce` deu 21 pass, 3 fail, 0 skip. Uma falha exige o tipo `Symbol`, que faltava; duas exercitam chamadas de cauda próprias em código estrito e estouram a pilha nativa. Quatro casos negativos de parsing passaram pela rejeição do compilador. São capacidades ausentes já acompanhadas, e não evidência de que `??` esteja quebrado de modo geral.

Em 2026-09-26, os grupos fixados completos `built-ins/parseInt` e `built-ins/parseFloat` passaram 55/55 e 54/54. A primeira execução completa de `built-ins/Array` deu 2632 pass, 360 fail, 90 skip de 3082; todos os 90 ignorados são testes de `Array.fromAsync` (uma API posterior ao ES2020); ela revelou um bug de conclusão de iteradores e cinco timeouts com arrays esparsos, já corrigidos. A nova execução completa de Array dá 2640 pass, 352 fail, 90 skip. Cada falha restante tem um pré-requisito registrado na [lista de adiamentos da v0.4](https://github.com/40oleg/nona/blob/main/docs/history/v0.4-array-deferred.json): 150 casos de APIs posteriores ao ES2020, 72 casos de buffers redimensionáveis e 130 outras dependências futuras ou a exceção documentada do `eval`. O manifesto positivo passa 100/100.

Depois da v0.4.0, o grupo completo `built-ins/String/fromCodePoint` passa 11/11. Um caso é mantido no manifesto smoke fixado; naquele momento, o manifesto passava 101/101.

O grupo completo `built-ins/String/raw` passa 30/30. Seu caso de template com tag está incluído no manifesto smoke positivo fixado. O manifesto atualizado passa 102/102; os exemplos compatíveis no Windows e no Linux passam 54/54 cada.

O grupo completo `built-ins/String/prototype/concat` passa 22/22. Um caso está incluído no manifesto smoke positivo. O manifesto atualizado passa 103/103; os exemplos compatíveis no Windows e no Linux passam 55/55 cada.

O grupo `built-ins/String/prototype/toUpperCase` dá 24 pass / 2 fail / 0 skip. As duas falhas exigem `RegExp` e `eval` direto, ambos acompanhados fora da v0.5. O caso de mapeamento especial de maiúsculas do Unicode está no manifesto smoke positivo, agora 104/104. Os exemplos compatíveis no Windows e no Linux passam 56/56 cada.

O grupo `built-ins/String/prototype/toLowerCase` dá 28 pass / 2 fail / 0 skip. Suas duas falhas também exigem `RegExp` e `eval` direto. O mapeamento condicional do sigma final, incluindo caracteres `Case_Ignorable`, passa. O manifesto smoke positivo está em 105/105; os exemplos compatíveis, em 57/57 no Windows e no Linux.

O grupo completo `built-ins/Number/prototype/toFixed` dá 15 pass / 1 fail / 0 skip. O caso que falha usa BigInt, previsto para a v0.8. O caso de exatidão está no manifesto smoke positivo, agora 106/106; os exemplos compatíveis passam 58/58 no Windows e no Linux.

Os grupos completos `built-ins/Number/prototype/toExponential` e `built-ins/Number/prototype/toPrecision` passam 15/15 e 17/17. Seus casos com valores comuns estão no manifesto smoke positivo, agora 108/108. Os exemplos compatíveis passam 59/59 no Windows e no Linux.

Uma primeira execução completa de `built-ins/Math`, antes das adições trigonométricas, deu 176 pass / 151 fail de 327. A maioria das falhas era de funções transcendentes do ES2020 que faltavam; `f16round` e `sumPrecise` são APIs posteriores. Os grupos completos `Math.sin`, `Math.cos` e `Math.tan` agora passam 8/8, 9/9 e 9/9. O smoke positivo está em 111/111; os exemplos compatíveis passam 60/60 no Windows e no Linux.

Os grupos completos `Math.log`, `Math.log2` e `Math.log10` passam 9/9, 5/5 e 5/5. O smoke positivo está em 114/114; os exemplos compatíveis passam 61/61 no Windows e no Linux.

Os grupos completos `Math.exp` e `Math.expm1` passam 9/9 e 5/5. O smoke positivo está em 116/116; os exemplos compatíveis passam 62/62 no Windows e no Linux.

Os grupos completos `Math.atan` e `Math.atan2` passam 7/7 e 11/11. O smoke positivo está em 118/118; os exemplos compatíveis passam 63/63 no Windows e no Linux.

O grupo completo `Math.log1p` passa 5/5. O smoke positivo está em 119/119; os exemplos compatíveis passam 64/64 no Windows e no Linux.

O grupo completo `Math.cbrt` passa 5/5. O smoke positivo está em 120/120; os exemplos compatíveis passam 65/65 no Windows e no Linux.

Os grupos completos `Math.asin` e `Math.acos` passam 9/9 e 8/8. O smoke positivo está em 122/122; os exemplos compatíveis passam 66/66 no Windows e no Linux.

Os grupos completos `encodeURI` e `encodeURIComponent` passam 31/31 cada. O smoke positivo está em 124/124; os exemplos compatíveis passam 67/67 no Windows e no Linux.

Os grupos completos `decodeURI` e `decodeURIComponent` passam 55/55 e 56/56. O smoke positivo está em 126/126; os exemplos compatíveis passam 68/68 no Windows e no Linux.

O grupo completo `Math.atanh` passa 5/5. O smoke positivo está em 127/127; os exemplos compatíveis passam 69/69 no Windows e no Linux. A execução completa dos testes nativos depois do trabalho com URI deu 1632 aprovados, 27 ignorados e nenhuma falha.

Os grupos completos `Math.asinh` e `Math.acosh` passam 5/5 e 7/7. O smoke positivo está em 129/129; os exemplos compatíveis passam 70/70 no Windows e no Linux.

Os grupos completos `Math.sinh`, `Math.cosh` e `Math.tanh` passam 5/5 cada. O smoke positivo está em 132/132; os exemplos compatíveis passam 71/71 no Windows e no Linux.

Uma execução completa de `built-ins/Math` agora dá 312 aprovados e 15 falhas de 327. Todas as 15 falhas envolvem `Math.f16round` e `Math.sumPrecise`, que são posteriores ao ES2020. Isso não mede a precisão das funções transcendentes para entradas finitas arbitrárias. A redução de ângulos grandes para `sin`, `cos` e `tan` foi adicionada depois dessa execução e verificada contra o Node.js 26 em todos os expoentes binários.

`String.prototype.toLocaleLowerCase` e `toLocaleUpperCase` passam 26/28 e 24/26. Os quatro testes restantes exigem RegExp ou eval. O smoke positivo está em 134/134; os exemplos compatíveis passam 72/72 no Windows e no Linux. Mapeamentos específicos de localidade além do mapeamento Unicode padrão ainda precisam ser avaliados.

`String.prototype.split` passa 86/120 casos do Test262. Os 34 restantes exigem RegExp, BigInt ou eval. Separadores de string, limites, separadores primitivos e hooks `Symbol.split` personalizados são verificados. O smoke positivo está em 137/137; os exemplos compatíveis passam 73/73 no Windows e no Linux.

`Math.sin`, `Math.cos` e `Math.tan` para ângulos grandes agora usam uma tabela de `2/pi` em ponto fixo de 1152 bits. Os testes nativos passam 48/48, incluindo 80 valores finitos determinísticos nos expoentes 63–1022. Os exemplos compatíveis passam 74/74 no Windows e no Linux.

`String.prototype.replace` passa 24/55 casos do Test262. Os 31 restantes exigem RegExp, BigInt ou construção dinâmica de funções. Busca de strings, substituição funcional, padrões de substituição e `Symbol.replace` personalizado estão cobertos. O smoke positivo está em 140/140; os exemplos compatíveis passam 75/75 no Windows e no Linux.
