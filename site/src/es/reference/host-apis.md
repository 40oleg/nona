# APIs del host

::: info Traducción
Esta página es una traducción de la página en inglés [Host APIs](/reference/host-apis), generada a partir de [`docs/host-apis.md`](https://github.com/40oleg/nona/blob/main/docs/host-apis.md). La versión en inglés es la de referencia y puede ser más reciente.
:::

Los programas de Nona se ejecutan sin Node.js. Las APIs del host que se describen a continuación las implementan el runtime nativo y pequeños preludios de JavaScript compilados en cada ejecutable.

## Temporizadores y el bucle de eventos

Globales: `setTimeout(callback, delay, ...args)`, `setInterval`, `clearTimeout`, `clearInterval`, `queueMicrotask(callback)` y `performance.now()`.

- Tras el programa de nivel superior, el punto de entrada ejecuta un bucle de eventos: vacía la cola de tareas de Promise y luego, repetidamente, espera al vencimiento del temporizador más próximo, ejecuta su callback y vuelve a vaciar la cola de tareas. El proceso termina cuando no quedan temporizadores.
- Los temporizadores se ordenan por vencimiento y luego por orden de registro. El retardo sigue a Node.js: se convierte con `ToNumber`, y los valores `NaN`, menores que 1 o mayores que 2^31-1 pasan a ser 1.
- Los ids de temporizador son números (Node.js devuelve objetos `Timeout`). `clearTimeout` y `clearInterval` aceptan cualquier id; los ids desconocidos se ignoran.
- La espera usa `Sleep` en Windows y `nanosleep` en Linux, así que un programa inactivo no consume CPU. En Windows la resolución es el tick del temporizador del sistema (normalmente 15,6 ms).
- `performance.now()` usa el reloj monótono (`QueryPerformanceCounter`, `clock_gettime(CLOCK_MONOTONIC)`) y cuenta milisegundos desde el inicio del programa.
- Una excepción no capturada en el callback de un temporizador termina el proceso con código de salida 1, igual que una excepción no capturada en el programa de nivel superior.
- Los realms creados por el host de Test262 no instalan sus propios temporizadores.

## Programas de larga duración

- El recolector cuenta las pilas de corrutinas reservadas (1 MiB por cada función async o generador en ejecución, `rt.generatorStackBytes`) para su umbral, de modo que las corrutinas abandonadas, cuyas pilas solo libera el barrido, disparan recolecciones igual que la basura ordinaria.
- `tests/stability.test.ts` comprueba que diez veces más disparos de temporizador (con tareas de Promise y basura en cada tick) no aumentan el pico de memoria, que miles de corrutinas abandonadas se liberan y que un programa que espera un temporizador de dos segundos apenas consume CPU.
- Límites conocidos: el almacenamiento de propiedades, elementos y Map es lineal (#36), así que los programas con cientos de temporizadores vivos u objetos grandes se ralentizan; en Linux cada bloque del heap es un mapeo de memoria aparte (#37).
