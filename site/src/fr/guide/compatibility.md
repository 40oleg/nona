# Compatibilité et limites

## Périmètre

Nona cible le langage et les objets intégrés de la 11ᵉ édition normative d’ECMA-262 (juin 2020), pour les scripts et les modules ES. L’internationalisation ECMA-402, les API du navigateur et celles de Node.js sont des spécifications distinctes ; Nona ne fournit que les API de l’hôte listées dans la [Référence](/fr/reference/modules). Le contrat de complétude est tenu dans [`docs/es2020-contract.md`](https://github.com/40oleg/nona/blob/main/docs/es2020-contract.md).

Une version est décrite comme « ES2020 avec des exceptions documentées », jamais comme pleinement conforme à ES2020.

## `eval` et `Function` {#eval-and-function}

Nona compile à l’avance ; `eval` et les constructeurs dynamiques de fonctions ont donc besoin de leur texte source à la compilation :

- **Compilé à l’avance :** un littéral de chaîne, une concaténation de littéraux ou une variable à laquelle on n’affecte que de telles constantes (la valeur est comparée à l’exécution). Un `eval` direct voit la portée de l’appelant, `this`, `arguments`, `new.target` et `super` ; les formes indirectes (`(0, eval)(…)`, `globalThis.eval(…)`, `eval?.(…)`) s’exécutent dans la portée globale. Les appels à `Function`, `GeneratorFunction`, `AsyncFunction` et `AsyncGeneratorFunction` dont tous les arguments sont des littéraux sont compilés avec la sémantique de CreateDynamicFunction.
- **Non pris en charge :** un source calculé à l’exécution, des arguments spread passés à `eval` et `$262.evalScript`. Ils lèvent :

```text
EvalError: Nona compiles ahead of time: eval and Function need source text known at compile time
```

Les sources calculés à l’exécution sont suivis dans [#11](https://github.com/40oleg/nona/issues/11).

## Différences avec Node.js

| Domaine | Nona | Node.js |
| --- | --- | --- |
| `process.argv` | `[execPath, ...arguments]` : `argv[1]` est le premier argument | `[node, script, ...arguments]` |
| `process` | `argv`, `env`, `exit`, `exitCode`, `execPath`, `cwd`, `platform`, `arch`, `pid` | Un EventEmitter avec des flux, `nextTick`, `hrtime`, … |
| Identifiants de minuteurs | Nombres | Objets `Timeout` |
| `readFileSync(path)` | Renvoie un `Uint8Array` | Renvoie un `Buffer` |
| Encodages | `utf8` uniquement | Nombreux |
| Messages d’erreur sous Windows | Contiennent le chemin tel que fourni | Contiennent le chemin absolu |
| Modules | `nona:*`, `node:fs`, `node:process` et fichiers relatifs | Tout `node:*` et les paquets npm |
| `require`, `Buffer`, `node:path` | Non disponibles | Disponibles |
| `console.log` sans sortie standard | La sortie est ignorée | La sortie est ignorée ou une erreur est levée |

## Performances

- Les tableaux et `Map`/`Set` stockent leurs éléments dans des structures chaînées ; les très grandes collections sont plus lentes qu’avec V8 ([#13](https://github.com/40oleg/nona/issues/13), [#36](https://github.com/40oleg/nona/issues/36)).
- Le moteur RegExp est une VM à retour arrière écrite en JavaScript ([#14](https://github.com/40oleg/nona/issues/14)).
- Sous Windows, les minuteurs se réveillent au rythme du tick système (en général 15,6 ms).
- Il n’y a pas de JIT : le code est compilé une seule fois, à l’avance, sans optimisation guidée par profil.

## Realms

`$262.createRealm` est pris en charge pour Test262. Certains constructeurs implémentés dans des préludes JavaScript prennent encore leurs prototypes par défaut dans le mauvais realm lorsqu’ils sont appelés avec un `new.target` provenant d’un autre realm ([#7](https://github.com/40oleg/nona/issues/7)).

## Plateformes

- Cibles : Windows 10/11 x64 et Linux x86-64 uniquement.
- Les exécutables Windows n’importent que `KERNEL32.dll`, `KERNELBASE.dll` et les DLL déclarées via FFI ; les exécutables Linux sont statiques et utilisent directement les appels système.
- La FFI vers des DLL n’existe que sous Windows ; les appels système bruts, que sous Linux.
