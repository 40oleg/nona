# Status e roteiro

## Versão atual

**v0.10.0** — veja o [registro de mudanças](/changelog) (em inglês). O Nona é experimental: não passou por auditoria de segurança e não é um substituto direto do Node.js.

## Auditoria do Test262

Test262 fixado completo no Windows x64 (`scripts/test262-audit.ps1 -Unit`, recursos do ES2020 e anteriores):

| Diretório | Aprovados / aplicáveis | Falhas restantes |
| --- | --- | --- |
| `language/` | **22436 / 22492** (26 ignorados) | 44 `eval`, 1 semântica mais nova, 11 outras |
| `built-ins/` | **15868 / 15933** | 16 `eval`, 12 semântica mais nova, 37 outras |
| `built-ins/Atomics` (agentes) | **268 / 268** | — |
| `annexB/` | **996 / 1016** (8 ignorados) | 20 `eval` |

A classificação vem de `scripts/test262-summary.mjs`: os testes "`eval`" chamam `eval` ou `$262.evalScript` com código-fonte que o Nona não pode conhecer em tempo de compilação; os testes de "semântica mais nova" verificam comportamento de edições posteriores (a flag `v`, separadores numéricos, `Promise.any`, …) sob uma tag de recurso antiga ou ausente. A suíte unitária roda no Windows e no Linux na CI e compila e executa arquivos PE e ELF reais, muitos sob estresse do GC. Como executar as auditorias está descrito na página [Test262](/pt/reference/test262).

## Falhas restantes

Todas as falhas "outras" no Windows estão classificadas:

- `built-ins/Function` (25): o código da função vem do `toString` de objetos em tempo de execução — a exceção do `eval`.
- `is-a-constructor` para `AsyncFunction`, `AsyncGeneratorFunction` e `GeneratorFunction` (4): o harness do Test262 monta o código-fonte em tempo de execução.
- Outros realms (7): protótipos padrão de outro realm ([#7](https://github.com/40oleg/nona/issues/7)).
- Campos privados de classe em objetos não extensíveis (2): campos privados do ES2022 sem tag de recurso mais novo.

## Trabalho em aberto

- [#11](https://github.com/40oleg/nona/issues/11) — `eval` e `Function` com código calculado em tempo de execução.
- [#7](https://github.com/40oleg/nona/issues/7) — protótipos padrão de outros realms para construtores dos prelúdios.
- [#13](https://github.com/40oleg/nona/issues/13), [#36](https://github.com/40oleg/nona/issues/36) — elementos densos de arrays e tabelas hash para `Map`/`Set`.

A lista completa está no [GitHub](https://github.com/40oleg/nona/issues).

## Relatórios detalhados

- [Status do ES2020 para 0.17–0.20](https://github.com/40oleg/nona/blob/main/docs/v0.17-v0.20-status.md) (em russo)
- [Status da v0.6](https://github.com/40oleg/nona/blob/main/docs/v0.6-status.md) (em inglês)
- [Roteiro: plano inspirado no V8 e arquiteturas-alvo (em inglês)](https://github.com/40oleg/nona/blob/main/docs/roadmap.md)
- [Roteiro de versões 0.4–0.20](https://github.com/40oleg/nona/blob/main/docs/release-roadmap-0.4-0.20.md) (em russo)
