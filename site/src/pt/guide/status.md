# Status e roteiro

## Versão atual

**v0.30.0** — veja o [registro de mudanças](/changelog) (em inglês). O Nona é experimental: não passou por auditoria de segurança e não é um substituto direto do Node.js.

## Auditoria do Test262

A última auditoria completa do Test262 fixado, no Windows x64 para a v0.8.0 (`scripts/test262-audit.ps1 -Unit`, recursos do ES2020 e anteriores, mais os posteriores suportados, como os elementos de classe do ES2022):

| Diretório                     | Aprovados / aplicáveis           | Falhas restantes                             |
| ----------------------------- | -------------------------------- | -------------------------------------------- |
| `language/`                   | **22436 / 22492** (26 ignorados) | 44 `eval`, 1 semântica mais nova, 11 outras  |
| `built-ins/`                  | **15868 / 15933**                | 16 `eval`, 12 semântica mais nova, 37 outras |
| `built-ins/Atomics` (agentes) | **268 / 268**                    | —                                            |
| `annexB/`                     | **996 / 1016** (8 ignorados)     | 20 `eval`                                    |

A classificação vem de `scripts/test262-summary.mjs`: os testes "`eval`" chamam `eval` ou `$262.evalScript` com código-fonte que o Nona não pode conhecer em tempo de compilação; os testes de "semântica mais nova" verificam comportamento de edições posteriores (a flag `v`, separadores numéricos, `Promise.any`, …) sob uma tag de recurso antiga ou ausente. A suíte unitária roda no Windows e no Linux na CI e compila e executa arquivos PE e ELF reais, muitos sob estresse do GC. Como executar as auditorias está descrito na página [Test262](/pt/reference/test262).

## Métodos de cópia de arrays

Verificado após a auditoria, na revisão fixada do Test262 (Windows x64, [#308](https://github.com/40oleg/nona/issues/308)): os diretórios `built-ins/Array/prototype/{toSorted,toReversed,toSpliced,with}` e `Symbol.unscopables` passam 94 de 94, sem falhas restantes. As variantes de `%TypedArray%` não estão implementadas; veja a [base do Test262](https://github.com/40oleg/nona/blob/main/docs/test262.md) (em inglês).

## Falhas restantes

Estas são as falhas da auditoria da v0.8.0; as versões posteriores não repetiram a execução completa. Todas as falhas "outras" no Windows estão classificadas:

- `built-ins/Function` (26): o código da função vem do `toString` de objetos em tempo de execução — a exceção do `eval`.
- `is-a-constructor` para `AsyncFunction`, `AsyncGeneratorFunction` e `GeneratorFunction`, e o teste de `prototype` de arrow async (4): o harness do Test262 monta o código-fonte em tempo de execução.
- Outros realms (8): protótipos padrão de outro realm ([#7](https://github.com/40oleg/nona/issues/7), fechada depois da auditoria).
- Classes criadas por meio de `Function`, também em outro realm (10, `language/expressions/class`): código-fonte montado em tempo de execução. Os mesmos testes por meio de um alias de `eval` contam como falhas de `eval`.

A auditoria da v0.8.0 também encontrou sete falhas fatais (`Array.prototype.indexOf` em `Math` com um elemento, chaves herdadas e próprias de typed arrays) introduzidas com os elementos densos; elas foram corrigidas em [#119](https://github.com/40oleg/nona/issues/119), e a nova execução de `built-ins/Array` e `built-ins/TypedArrayConstructors` após a correção (incluída acima) as aprova.

## Trabalho em aberto

Lacunas na linguagem e na biblioteca:

- [#44](https://github.com/40oleg/nona/issues/44) — reações de Promise: um tipo de promise dedicado e um registro por `then`.

Desempenho, a linha principal do [roteiro](https://github.com/40oleg/nona/blob/main/docs/roadmap.md):

- Chamadas e alocação: [#47](https://github.com/40oleg/nona/issues/47) (custo das chamadas), [#48](https://github.com/40oleg/nona/issues/48) (objetos de vida curta), [#235](https://github.com/40oleg/nona/issues/235) (inlining), [#236](https://github.com/40oleg/nona/issues/236) (substituição escalar).
- Código gerado: [#237](https://github.com/40oleg/nona/issues/237)–[#242](https://github.com/40oleg/nona/issues/242) (encadeamento opcional, `%`, chamadas diretas, laços sobre typed arrays, tabelas de salto de `switch`, verificações da zona morta).
- Biblioteca: [#155](https://github.com/40oleg/nona/issues/155) (`JSON.stringify`), [#258](https://github.com/40oleg/nona/issues/258) (varredura inicial de RegExp), [#262](https://github.com/40oleg/nona/issues/262) (`shift` e `splice` em arrays grandes).

A lista completa está no [GitHub](https://github.com/40oleg/nona/issues).

## Relatórios detalhados

- [Status do ES2020 para 0.17–0.20](https://github.com/40oleg/nona/blob/main/docs/status.md) (em russo)
- [Histórico de versões](/changelog) e o [diário de desenvolvimento](https://github.com/40oleg/nona/blob/main/docs/history/development-log.md) (em russo)
- [Roteiro: plano inspirado no V8 e arquiteturas-alvo (em inglês)](https://github.com/40oleg/nona/blob/main/docs/roadmap.md)
- [Roteiro de versões 0.4–0.20](https://github.com/40oleg/nona/blob/main/docs/history/release-roadmap-0.4-0.20.md) (em russo)
