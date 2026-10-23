# Status e roteiro

## VersГЈo atual

**v0.25.0** вЂ” veja o [registro de mudanГ§as](/changelog) (em inglГЄs). O Nona Г© experimental: nГЈo passou por auditoria de seguranГ§a e nГЈo Г© um substituto direto do Node.js.

## Auditoria do Test262

A Гєltima auditoria completa do Test262 fixado, no Windows x64 para a v0.8.0 (`scripts/test262-audit.ps1 -Unit`, recursos do ES2020 e anteriores, mais os posteriores suportados, como os elementos de classe do ES2022):

| DiretГіrio                     | Aprovados / aplicГЎveis           | Falhas restantes                             |
| ----------------------------- | -------------------------------- | -------------------------------------------- |
| `language/`                   | **22436 / 22492** (26 ignorados) | 44 `eval`, 1 semГўntica mais nova, 11 outras  |
| `built-ins/`                  | **15868 / 15933**                | 16 `eval`, 12 semГўntica mais nova, 37 outras |
| `built-ins/Atomics` (agentes) | **268 / 268**                    | вЂ”                                            |
| `annexB/`                     | **996 / 1016** (8 ignorados)     | 20 `eval`                                    |

A classificaГ§ГЈo vem de `scripts/test262-summary.mjs`: os testes "`eval`" chamam `eval` ou `$262.evalScript` com cГіdigo-fonte que o Nona nГЈo pode conhecer em tempo de compilaГ§ГЈo; os testes de "semГўntica mais nova" verificam comportamento de ediГ§Гµes posteriores (a flag `v`, separadores numГ©ricos, `Promise.any`, вЂ¦) sob uma tag de recurso antiga ou ausente. A suГ­te unitГЎria roda no Windows e no Linux na CI e compila e executa arquivos PE e ELF reais, muitos sob estresse do GC. Como executar as auditorias estГЎ descrito na pГЎgina [Test262](/pt/reference/test262).

## MГ©todos de cГіpia de arrays

Verificado apГіs a auditoria, na revisГЈo fixada do Test262 (Windows x64, [#308](https://github.com/40oleg/nona/issues/308)): os diretГіrios `built-ins/Array/prototype/{toSorted,toReversed,toSpliced,with}` e `Symbol.unscopables` passam 94 de 94, sem falhas restantes. As variantes de `%TypedArray%` nГЈo estГЈo implementadas; veja a [base do Test262](https://github.com/40oleg/nona/blob/main/docs/test262.md) (em inglГЄs).

## Falhas restantes

Estas sГЈo as falhas da auditoria da v0.8.0; as versГµes posteriores nГЈo repetiram a execuГ§ГЈo completa. Todas as falhas "outras" no Windows estГЈo classificadas:

- `built-ins/Function` (26): o cГіdigo da funГ§ГЈo vem do `toString` de objetos em tempo de execuГ§ГЈo вЂ” a exceГ§ГЈo do `eval`.
- `is-a-constructor` para `AsyncFunction`, `AsyncGeneratorFunction` e `GeneratorFunction`, e o teste de `prototype` de arrow async (4): o harness do Test262 monta o cГіdigo-fonte em tempo de execuГ§ГЈo.
- Outros realms (8): protГіtipos padrГЈo de outro realm ([#7](https://github.com/40oleg/nona/issues/7), fechada depois da auditoria).
- Classes criadas por meio de `Function`, tambГ©m em outro realm (10, `language/expressions/class`): cГіdigo-fonte montado em tempo de execuГ§ГЈo. Os mesmos testes por meio de um alias de `eval` contam como falhas de `eval`.

A auditoria da v0.8.0 tambГ©m encontrou sete falhas fatais (`Array.prototype.indexOf` em `Math` com um elemento, chaves herdadas e prГіprias de typed arrays) introduzidas com os elementos densos; elas foram corrigidas em [#119](https://github.com/40oleg/nona/issues/119), e a nova execuГ§ГЈo de `built-ins/Array` e `built-ins/TypedArrayConstructors` apГіs a correГ§ГЈo (incluГ­da acima) as aprova.

## Trabalho em aberto

Lacunas na linguagem e na biblioteca:

- [#44](https://github.com/40oleg/nona/issues/44) вЂ” reaГ§Гµes de Promise: um tipo de promise dedicado e um registro por `then`.

Desempenho, a linha principal do [roteiro](https://github.com/40oleg/nona/blob/main/docs/roadmap.md):

- Chamadas e alocaГ§ГЈo: [#47](https://github.com/40oleg/nona/issues/47) (custo das chamadas), [#48](https://github.com/40oleg/nona/issues/48) (objetos de vida curta), [#235](https://github.com/40oleg/nona/issues/235) (inlining), [#236](https://github.com/40oleg/nona/issues/236) (substituiГ§ГЈo escalar).
- CГіdigo gerado: [#237](https://github.com/40oleg/nona/issues/237)вЂ“[#242](https://github.com/40oleg/nona/issues/242) (encadeamento opcional, `%`, chamadas diretas, laГ§os sobre typed arrays, tabelas de salto de `switch`, verificaГ§Гµes da zona morta).
- Biblioteca: [#155](https://github.com/40oleg/nona/issues/155) (`JSON.stringify`), [#258](https://github.com/40oleg/nona/issues/258) (varredura inicial de RegExp), [#262](https://github.com/40oleg/nona/issues/262) (`shift` e `splice` em arrays grandes).

A lista completa estГЎ no [GitHub](https://github.com/40oleg/nona/issues).

## RelatГіrios detalhados

- [Status do ES2020 para 0.17вЂ“0.20](https://github.com/40oleg/nona/blob/main/docs/status.md) (em russo)
- [HistГіrico de versГµes](/changelog) e o [diГЎrio de desenvolvimento](https://github.com/40oleg/nona/blob/main/docs/history/development-log.md) (em russo)
- [Roteiro: plano inspirado no V8 e arquiteturas-alvo (em inglГЄs)](https://github.com/40oleg/nona/blob/main/docs/roadmap.md)
- [Roteiro de versГµes 0.4вЂ“0.20](https://github.com/40oleg/nona/blob/main/docs/history/release-roadmap-0.4-0.20.md) (em russo)
