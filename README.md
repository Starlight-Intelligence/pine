# Pine

> [!CAUTION]
> **超级早期 WIP / Extremely early work in progress**
>
> Pine 仍处于快速探索阶段，尚不适合日常工作或处理重要数据。界面、数据格式、Agent 行为和项目结构都可能随时发生不兼容变更。目前没有稳定版本，也不提供迁移或兼容性保证。
>
> Pine is still an experiment under active development. It is not ready for daily use or important data. Expect incomplete features, breaking changes, and no compatibility guarantees.

**致力于为所有人提供更多可能性的 AI 代理工作区。**

**Agentic workspace dedicated to expanding possibilities for everyone.**

Pine 是一个本地优先、开源的桌面 Agent 工作区实验。它希望把项目文件、会话、上下文边界与 AI 代理放进一个清晰、可理解、可掌控的工作空间，让不同技术背景的人都能借助 Agent 思考、创造和完成任务。

## 当前方向

- **项目工作区**：围绕默认文件夹、额外上下文文件夹和会话组织工作。
- **明确的访问边界**：由用户选择 Agent 可以读取或写入的本地目录。
- **Human in the loop**：让用户能够理解、审批、打断和接管 Agent 的行动。
- **本地优先**：桌面端负责文件系统、shell 与会话能力，渲染进程通过受限 IPC 访问它们。
- **可扩展 Agent**：逐步支持模型切换、工具调用、skills 和可复用工作流。
- **双语界面**：目前以简体中文和英文为主要界面语言。

## 已实现

- Electron 桌面应用基础架构
- 多项目创建、编辑、打开与删除
- 默认文件夹与额外上下文文件夹管理
- 项目文件树、会话侧边栏与多标签内容区
- Agent 会话输入和模型、推理强度、审批模式界面
- 浅色、深色、跟随系统主题及中英文切换
- 项目元数据、文件访问和会话相关的主进程 IPC 基础

大量核心能力仍未完成，包括真正可用的端到端 Agent 执行、安全边界加固、稳定的数据迁移、发行打包和自动更新。进度与设计讨论可参考 [`docs/`](./docs/)。

## 技术栈

- [Electron](https://www.electronjs.org/) + Electron Forge
- [Vue 3](https://vuejs.org/) + TypeScript
- Vue Router + Pinia
- [shadcn-vue](https://www.shadcn-vue.com/) + Reka UI
- Tailwind CSS v4
- Vitest + Vue Test Utils
- Bun workspace monorepo

## 本地开发

需要安装 [Bun](https://bun.sh/)，版本以根目录 `package.json` 的 `packageManager` 为准。

```bash
git clone https://github.com/Starlight-Intelligence/pine.git
cd pine
bun install --frozen-lockfile
bun run dev
```

常用命令：

| 命令                    | 用途                               |
| ----------------------- | ---------------------------------- |
| `bun run dev`           | 启动桌面端开发环境                 |
| `bun run build`         | 构建桌面应用安装产物               |
| `bun run check`         | 运行格式、Lint、类型检查与单元测试 |
| `bun run test`          | 运行单元测试                       |
| `bun run test:coverage` | 生成测试覆盖率报告                 |
| `bun run typecheck`     | 运行 TypeScript/Vue 类型检查       |

## 仓库结构

```text
apps/
  desktop/       Electron 桌面端
packages/        共享包（逐步建设中）
docs/            产品、架构与项目系统文档
```

这是一个 Bun monorepo。桌面端渲染进程不会直接访问 Node.js、文件系统或 shell；原生能力应通过 preload 暴露的最小 IPC API 进入主进程。

## 参与贡献

直接依赖统一使用精确版本，`bunfig.toml` 已设置 [`install.exact = true`](https://bun.sh/docs/runtime/bunfig#install-exact)。`bun.lock` 必须随依赖变更一起提交；首次安装、CI 和复现构建使用 [`bun install --frozen-lockfile`](https://bun.sh/docs/pm/cli/install)，避免安装时修改锁文件。

新增或升级依赖时，在所属 workspace 执行 `bun add <包名>@<明确版本>`，开发工具加 `--dev`。桌面端工具声明在 `apps/desktop/package.json`；根目录仅保留仓库级工具，TypeScript 在两处声明相同版本，因为 Vue 编译器显式从根目录加载它。Electron Forge 各包、Vue 及其内部包、Tailwind 及其 Vite 插件、Vitest 及覆盖率插件应分别同步升级并验证。

`bun run shadcn:add <component>` 使用仓库固定版本的 shadcn-vue CLI；升级 CLI 时先显式更新它的依赖版本。组件生成器可能修改依赖约束，运行后需检查 `package.json` 与锁文件，将直接依赖保存为本次解析出的精确版本，并保留生成器带来的升级结果。

Issue、设计讨论和代码贡献都欢迎，但请注意当前架构仍会频繁调整。提交改动前请运行：

```bash
bun run check
```

## License

Pine is free software licensed under the [GNU General Public License v3.0 only](./LICENSE). See `LICENSE` for the full terms.
