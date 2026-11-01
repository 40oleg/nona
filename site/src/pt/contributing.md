# Como contribuir

## Ambiente de desenvolvimento

```sh
git clone https://github.com/40oleg/nona.git
cd nona
npm ci
npm run check            # build and run the unit suite
npm run compare          # compile examples/compat and compare with Node.js
npm run compare:linux    # the same for linux-x64
npm run test262:smoke    # a quick pinned Test262 subset
npm run format           # Prettier; CI runs npm run format:check
```

A suíte compila e executa executáveis reais: os testes PE rodam no Windows e os ELF no Linux, muitos sob estresse do GC. A CI (`.github/workflows/check.yml`) executa a suíte completa e grupos do Test262 no Windows com Node.js 26, e os testes nativos no Linux. As auditorias completas do Test262 estão descritas na página [Test262](/pt/reference/test262).

## Fluxo de trabalho

- Toda mudança começa em uma issue do GitHub com motivação, proposta e critérios de aceitação.
- Uma issue, uma branch (`issue-<number>-<short-slug>`), um pull request, cuja descrição contém `Closes #N`, o design, como foi testado e as limitações conhecidas.
- Mantenha a `main` verde: um pull request só é mesclado quando o workflow `check` passa.
- Issues, pull requests, mensagens de commit, comentários de código e a documentação são escritos em inglês.

## Testes

Os testes ficam em `tests/*.test.ts`. Prefira `runOnHost` com o oráculo do Node.js (`runOracle`): assim o mesmo teste roda nos dois alvos, sob estresse do GC, e compara a saída do programa com o Node.js.

Cada arquivo de testes pertence a exatamente uma suíte em `tests/suites.json`; adicione um arquivo novo à suíte cujos jobs de CI devem executá-lo (`windows-only` se apenas a execução completa no Windows). `node scripts/run-suite.mjs <suíte...>` executa suítes localmente, e `tests/suites.test.ts` falha enquanto um arquivo não estiver atribuído.

## Convenções de código

- O compilador é escrito em TypeScript (`src/`). O código do runtime é emitido como x86-64 via `RuntimeBuilder` (`src/runtime/*.ts`) ou escrito como prelúdios JavaScript (`src/lib/runtime/*.js`) compilados em cada executável.
- Prelúdios não devem adicionar bindings `var` de nível superior; envolva o código em uma IIFE.
- As funções nativas do runtime seguem a ABI Win64 (shadow space, alinhamento de 16 bytes nas chamadas, registradores preservados pela função chamada). Funções que mantêm valores entre chamadas que podem alocar usam `rootedFn`.
- Toda nova importação do KERNEL32 precisa de um shim de chamada de sistema do Linux em `src/backend/linux/shims.ts`.
- Os executáveis gerados continuam livres de dependências externas: sem toolchain de C e sem bibliotecas empacotadas. O macOS pode usar a libSystem do sistema operacional para a inicialização nativa e para serviços; os demais alvos continuam sem libc.

## Profiling e benchmarks

`node bench/run.mjs` executa os benchmarks por trás da página de [Desempenho](/pt/guide/performance). `scripts/profile-runtime.mjs` conta as instruções executadas por cada rotina do runtime (um trace do QEMU), e `--call-stats` na [linha de comando](/pt/reference/cli) conta as chamadas feitas por um programa.

## Documentação

Quando um recurso muda um comportamento visível para os programas, atualize:

- `README.md` e `README.ru.md`;
- o documento de referência em `docs/` (`host-apis.md`, `process.md`, `fs.md`, `network.md`, `npm.md`, `ffi.md`, `native-platforms.md`, `windows-executables.md`, `test262.md`) — o site inclui esses arquivos automaticamente;
- as páginas do site em `site/src/` que descrevem o recurso, como as de [suporte à linguagem](/pt/guide/language-support) ou [linha de comando](/pt/reference/cli);
- `CHANGELOG.md` em `## Unreleased`, com um link para a issue.

## Site de documentação

O site é construído com [VitePress](https://github.com/vuejs/vitepress) a partir de `site/`:

```sh
npm run build              # the compiler, needed to check the samples
cd site
npm ci
npm run dev                # local server with live reload
npm run build              # production build; fails on broken internal links
npm run check:samples      # compiles every program in site/samples
```

Os exemplos executáveis são arquivos de `site/samples/` incluídos com `<<<`; um nome que contém `.win32.` ou `.linux.` restringe o exemplo a esse alvo. `site/README.md` explica como adicionar uma página. O site é publicado no GitHub Pages a partir da `main` pelo `.github/workflows/pages.yml`.

O site está traduzido para vários idiomas. As páginas em inglês são a fonte; as traduções ficam em `site/src/<locale>/`. Quando uma página em inglês muda, atualize as traduções ou, no mínimo, garanta que elas não a contradigam.

## Colaboradores automatizados

As regras para agentes — reservar issues com o label `blocked`, autoria dos commits e checklist de pull requests — estão em [`AGENTS.md`](https://github.com/40oleg/nona/blob/main/AGENTS.md).

The [combination program corpus](https://github.com/40oleg/nona/tree/main/programs) contains 1,000 individually authored standalone applications. Run `npm run check:programs` to compare each with Node.js in normal and GC-stress execution. The dedicated corpus workflow runs all cases on Linux and Windows for every push and pull request; these checks also belong to `npm run check`.
