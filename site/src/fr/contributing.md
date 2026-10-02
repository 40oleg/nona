# Contribuer

## Environnement de développement

```sh
git clone https://github.com/40oleg/nona.git
cd nona
npm ci
npm run check            # build and run the unit suite
npm run compare          # compile examples/compat and compare with Node.js
npm run compare:linux    # the same for linux-x64
npm run test262:smoke    # a quick pinned Test262 subset
```

La suite compile et exécute de vrais exécutables : les tests PE s’exécutent sous Windows et les tests ELF sous Linux, souvent sous stress du ramasse-miettes. La CI (`.github/workflows/check.yml`) exécute la suite complète et des groupes Test262 sous Windows avec Node.js 26, et les tests natifs sous Linux. Les audits Test262 complets sont décrits sur la page [Test262](/fr/reference/test262).

## Processus

- Chaque modification part d’une issue GitHub qui expose la motivation, une proposition et des critères d’acceptation.
- Une issue, une branche (`issue-<number>-<short-slug>`), une pull request, dont la description contient `Closes #N`, la conception, la manière dont le changement a été testé et les limites connues.
- Gardez `main` au vert : une pull request n’est fusionnée que si le workflow `check` réussit.
- Les issues, pull requests, messages de commit, commentaires de code et la documentation sont rédigés en anglais.

## Tests

Les tests se trouvent dans `tests/*.test.ts`. Privilégiez `runOnHost` avec l’oracle Node.js (`runOracle`) : le même test s’exécute alors sur les deux cibles, sous stress du ramasse-miettes, et compare la sortie du programme avec Node.js.

## Conventions de code

- Le compilateur est écrit en TypeScript (`src/`). Le code du runtime est émis en x86-64 via `RuntimeBuilder` (`src/runtime/*.ts`) ou écrit sous forme de préludes JavaScript (`src/runtime/*-source.ts`) compilés dans chaque exécutable.
- Les préludes ne doivent pas ajouter de liaisons `var` de premier niveau ; enveloppez le code dans une IIFE.
- Les fonctions natives du runtime suivent l’ABI Win64 (shadow space, alignement sur 16 octets aux appels, registres préservés par l’appelé). Les fonctions qui conservent des valeurs à travers des appels susceptibles d’allouer utilisent `rootedFn`.
- Chaque nouvel import KERNEL32 nécessite une cale d’appel système Linux dans `src/backend/linux/shims.ts`.
- Les exécutables générés restent sans dépendances externes : pas de libc, pas de chaîne de compilation C, pas de DLL embarquées.

## Documentation

Lorsqu’une fonctionnalité modifie un comportement visible par les programmes, mettez à jour :

- `README.md` et `README.ru.md` ;
- le document de référence dans `docs/` (`host-apis.md`, `process.md`, `fs.md`, `ffi.md`, `windows-executables.md`, `test262.md`) — le site inclut ces fichiers automatiquement ;
- les pages du site dans `site/src/` qui décrivent la fonctionnalité, comme les pages [Prise en charge du langage](/fr/guide/language-support) ou [Ligne de commande](/fr/reference/cli) ;
- `CHANGELOG.md` sous `## Unreleased`, avec un lien vers l’issue.

## Site de documentation

Le site est construit avec [VitePress](https://vitepress.dev) à partir de `site/` :

```sh
npm run build              # the compiler, needed to check the samples
cd site
npm ci
npm run dev                # local server with live reload
npm run build              # production build; fails on broken internal links
npm run check:samples      # compiles every program in site/samples
```

Les exemples exécutables sont des fichiers de `site/samples/` inclus avec `<<<` ; un nom contenant `.win32.` ou `.linux.` limite l’exemple à cette cible. `site/README.md` explique comment ajouter une page. Le site est déployé sur GitHub Pages depuis `main` par `.github/workflows/pages.yml`.

Le site est traduit en plusieurs langues. Les pages anglaises sont la source ; les traductions se trouvent dans `site/src/<locale>/`. Lorsqu’une page anglaise change, mettez à jour ses traductions, ou au moins assurez-vous qu’elles ne la contredisent pas.

## Contributeurs automatisés

Les règles destinées aux agents — réservation des issues avec le label `blocked`, paternité des commits et liste de contrôle des pull requests — se trouvent dans [`AGENTS.md`](https://github.com/40oleg/nona/blob/main/AGENTS.md).
