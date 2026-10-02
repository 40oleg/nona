# Executáveis do Windows

::: info Tradução
Esta página é uma tradução da página em inglês [Windows executables](/reference/windows-executables), gerada a partir de [`docs/windows-executables.md`](https://github.com/40oleg/nona/blob/main/docs/windows-executables.md). A versão em inglês é a de referência e pode ser mais recente.
:::

## Subsistema

`nona build app.js -o app.exe --subsystem windows` marca a imagem PE como programa gráfico (campo Subsystem 2 do cabeçalho opcional). O Windows então o inicia sem janela de console, o que é adequado para programas em segundo plano e utilitários da bandeja do sistema. O padrão é `--subsystem console` (3). A opção exige `--target win32-x64`.

Um programa gráfico continua escrevendo a saída de `console.log` nos handles de saída padrão que herda (por exemplo, pipes configurados pelo processo pai). Quando não há saída padrão — sem console, com um handle fechado ou desanexado, ou com uma escrita que falha —, a saída é descartada e o programa continua; versões anteriores encerravam com código de saída 1.

## Recursos

```text
nona build app.js -o app.exe --icon app.ico --manifest app.manifest --version-info version.json
```

- `--icon` incorpora todas as imagens de um arquivo `.ico` (`RT_ICON` 1…n e `RT_GROUP_ICON` 1); o Explorer e a barra de tarefas o exibem.
- `--manifest` incorpora um manifesto de aplicativo (`RT_MANIFEST` 1). Ele precisa ser válido: o Windows se recusa a iniciar um programa com manifesto malformado. Programas compilados com `--subsystem windows` e sem manifesto recebem um padrão: `asInvoker`, compatibilidade com Windows 10/11 e reconhecimento de DPI por monitor.
- `--version-info` lê um objeto JSON com qualquer um dos campos `FileVersion`, `ProductVersion` (`"major.minor.build.revision"`, partes de 0 a 65535), `ProductName`, `FileDescription`, `CompanyName`, `LegalCopyright`, `OriginalFilename`, `InternalName` e `Comments`, exibidos em Propriedades → Detalhes do arquivo (`RT_VERSION` 1, idioma 0409, página de código 04B0).

```json
{ "FileVersion": "1.0.0.0", "ProductName": "Museum", "FileDescription": "Paintings on the desktop", "CompanyName": "Oleg" }
```

As mesmas opções estão disponíveis em `compile()` como `icon` (bytes), `manifest` (string) e `versionInfo` (objeto). Elas exigem `--target win32-x64`.
