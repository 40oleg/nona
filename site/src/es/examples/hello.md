# Hola, temporizadores

El programa más pequeño que usa el bucle de eventos.

<<< ../../../samples/hello.js

::: code-group

```sh [Windows]
node dist/cli.js build hello.js -o build/hello.exe
.\build\hello.exe
```

```sh [Linux]
node dist/cli.js build hello.js -o build/hello --target linux-x64
./build/hello
```

:::

```text
Hello, from Nona!
a microtask runs before any timer
tick 1
tick 2
tick 3
done; at least 30 ms passed: true
```

## Qué ocurre

1. Se ejecuta el código de nivel superior: imprime el saludo, encola una microtarea e inicia un temporizador de intervalo.
2. Cuando termina el código de nivel superior, el bucle de eventos vacía primero la cola de tareas de Promise, así que la microtarea se ejecuta antes que cualquier temporizador.
3. El bucle espera hasta el siguiente vencimiento de temporizador sin usar la CPU, ejecuta el callback y vuelve a vaciar la cola de tareas.
4. Tras el tercer tick, el callback cancela el intervalo. Sin temporizadores ni tareas pendientes, el programa termina con estado 0.

El orden sigue las mismas reglas que en Node.js: código síncrono, después microtareas y después temporizadores por vencimiento y orden de registro. Consulta [Temporizadores y bucle de eventos](/es/reference/host-apis).
