# 参与贡献

## 开发环境

```sh
git clone https://github.com/40oleg/nona.git
cd nona
npm ci
npm run check            # build and run the unit suite
npm run compare          # compile examples/compat and compare with Node.js
npm run compare:linux    # the same for linux-x64
npm run test262:smoke    # a quick pinned Test262 subset
```

测试集会编译并运行真实的可执行文件：PE 测试在 Windows 上运行，ELF 测试在 Linux 上运行，其中很多在 GC 压力模式下运行。CI（`.github/workflows/check.yml`）在 Windows 上用 Node.js 26 运行完整测试集和 Test262 分组，并在 Linux 上运行原生测试。完整的 Test262 审计见 [Test262](/zh/reference/test262) 页面。

## 工作流程

- 每项改动都从一个 GitHub issue 开始，其中包含动机、方案和验收标准。
- 一个 issue 对应一个分支（`issue-<number>-<short-slug>`），对应一个 pull request；PR 描述中包含 `Closes #N`、设计说明、测试方式和已知限制。
- 保持 `main` 为绿色：只有 `check` 工作流通过时才合并 pull request。
- issue、pull request、提交信息、代码注释和文档都用英文书写。

## 测试

测试位于 `tests/*.test.ts`。优先使用带 Node.js 对照（`runOracle`）的 `runOnHost`：这样同一个测试会在两个目标平台上、在 GC 压力下运行，并把程序输出与 Node.js 对比。

## 代码约定

- 编译器用 TypeScript 编写（`src/`）。运行时代码要么通过 `RuntimeBuilder`（`src/runtime/*.ts`）以 x86-64 形式生成，要么写成 JavaScript 前导代码（`src/runtime/*-source.ts`），编译进每个可执行文件。
- 前导代码不得添加顶层 `var` 绑定；请把代码包在 IIFE 中。
- 原生运行时函数遵循 Win64 ABI（影子空间、调用时 16 字节对齐、被调用方保存的寄存器）。在可能分配内存的调用之间持有值的函数要使用 `rootedFn`。
- 每个新的 KERNEL32 导入都需要在 `src/backend/linux/shims.ts` 中提供 Linux 系统调用垫片。
- 生成的可执行文件不能有外部依赖：不用 libc、不用 C 工具链、不捆绑 DLL。

## 文档

当某个特性改变了程序可见的行为时，请更新：

- `README.md` 和 `README.ru.md`；
- `docs/` 中的参考文档（`host-apis.md`、`process.md`、`fs.md`、`ffi.md`、`windows-executables.md`、`test262.md`）——网站会自动包含这些文件；
- `site/src/` 中描述该特性的网站页面，例如[语言支持](/zh/guide/language-support)或[命令行](/zh/reference/cli)页面；
- `CHANGELOG.md` 的 `## Unreleased` 部分，并附上 issue 链接。

## 文档网站

网站使用 [VitePress](https://vitepress.dev) 从 `site/` 构建：

```sh
npm run build              # the compiler, needed to check the samples
cd site
npm ci
npm run dev                # local server with live reload
npm run build              # production build; fails on broken internal links
npm run check:samples      # compiles every program in site/samples
```

可运行的示例是 `site/samples/` 中的文件，用 `<<<` 引入；文件名中包含 `.win32.` 或 `.linux.` 时，示例只针对对应的目标平台。`site/README.md` 说明了如何添加页面。网站由 `.github/workflows/pages.yml` 从 `main` 部署到 GitHub Pages。

网站已被翻译成多种语言。英文页面是源文本；译文位于 `site/src/<locale>/`。英文页面发生变化时，请更新对应的译文，或至少确保译文与之不矛盾。

## 自动化贡献者

面向代理（agent）的规则——用 `blocked` 标签认领 issue、提交作者身份以及 pull request 检查清单——见 [`AGENTS.md`](https://github.com/40oleg/nona/blob/main/AGENTS.md)。
