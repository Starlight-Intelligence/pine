# Pine

> [!CAUTION]
> **超级早期 WIP / Extremely early work in progress**
>
> Pine 仍处于快速探索阶段，尚不适合日常工作或处理重要数据。界面、数据格式、Agent 行为和项目结构都可能随时发生不兼容变更。目前没有稳定版本，也不提供迁移或兼容性保证。
>
> Pine is still an experiment under active development. It is not ready for daily use or important data. Expect incomplete features, breaking changes, and no compatibility guarantees.

**致力于为所有人提供更多可能性的 AI 代理工作区。**

**Agentic workspace dedicated to expanding possibilities for everyone.**

Pine 是一个本地优先、开源的桌面 Agent 工作区实验。它把项目文件、会话、上下文边界与 AI 代理放进一个清晰、可理解、可掌控的工作空间，让不同技术背景的人都能借助 Agent 思考、创造和完成任务。

## 当前状态

截至 2026-09-05，Pine 已经具备从 Project Library 创建或打开项目、选择文件夹、启动持久化会话、运行 Agent 工具调用并在界面中查看结果的可用闭环。当前版本是 `0.1.0`，仍属于开发者预览版，不是稳定发行版。

当前仓库验证结果：

- `bun run check` 通过：格式检查、Lint、TypeScript/Vue 类型检查；57 个测试文件通过，395 个测试通过，14 个测试跳过。
- `bun run build` 已在 macOS arm64 上完成 Electron Forge 打包流程。CI 当前发布的是 macOS Apple Silicon 与 Intel 的 nightly snapshot；Windows/Linux maker 已配置，但还不是当前验证过的发布渠道。

## 当前已实现

- **Project System v1**：Project 是 Pine 管理的逻辑容器，可包含一个或多个文件夹；每个文件夹可设为只读或读写，并指定默认工作目录。支持项目的创建、列表、搜索、打开、编辑和删除，也会保留不可用文件夹的元数据。
- **项目文件工作区**：延迟加载文件树，支持新建、重命名、移动、删除、打开、在 Finder 中显示和复制路径；文件访问通过主进程校验 `folderId + relativePath`，渲染进程不直接访问文件系统。
- **Agent 会话闭环**：Agent 在 Electron utility process 中运行，支持流式回复、工具调用事件、持久化 Pi JSONL session、继续/中止/重命名/删除会话、会话全文搜索、steering 消息和上下文用量显示。
- **本地工具与权限模式**：提供受项目文件夹和附件授权约束的 read/write/edit/bash 工具；支持 Let Me Review、Auto Approve 和 YOLO 三种审批模式。越过项目边界的 `privileged_bash` 需要单独审批，破坏性操作和沙箱拒绝也会进入审批流程。
- **模型与认证**：支持动态 provider/model catalog、API key/OAuth 登录流程、模型切换、thinking level，以及用于标题生成和自动批准的 utility model 配置。
- **可选网络工具**：配置 TinyFish API key 后，Agent 可使用 `web_search` 和 `web_fetch`；URL、域名、响应大小和私有网络地址均有校验。
- **附件与预览**：支持文件/文件夹附件、粘贴图片，以及文本、图片、视频、PDF 和 DOCX/XLS/XLSX/PPTX 文件预览。附件和预览通过受限 preload IPC 与自定义协议提供。
- **桌面体验**：Vue Router + Pinia 的项目导航和跨视图状态、会话/文件多标签、中文/英文界面、浅色/深色/跟随系统主题、窗口快捷键和 macOS 侧栏模糊效果。

## 当前未实现或仍属路线图

以下内容在 [`docs/framework.md`](./docs/framework.md) 中有产品设计讨论，但不是当前版本已经交付的功能：

- checkpoint / Git 快照、回滚和时间线；
- 文件内批注、批注上下文和 annotation layer；
- Skill 生成、管理与启用；
- workflow 图、takeaway 和更完整的任务编排；
- 旧版 `.pine/` 数据导入、项目迁移和稳定的数据格式兼容；
- 稳定版发布、自动更新和跨平台发布验证。

项目元数据和 session 当前存放在 Electron `app.getPath("userData")` 下的 Pine 管理目录中，不会自动在用户项目文件夹写入 `.pine/`。Project System 的实现基准见 [`docs/project-system.md`](./docs/project-system.md)，执行环境和权限边界见 [`docs/agent-execution-environment.md`](./docs/agent-execution-environment.md)。

## 技术栈

- [Electron](https://www.electronjs.org/) + Electron Forge
- [Vue 3](https://vuejs.org/) + TypeScript
- Vue Router + Pinia
- [shadcn-vue](https://www.shadcn-vue.com/) + Reka UI
- Tailwind CSS v4
- Vitest + Vue Test Utils
- [`@earendil-works/pi-agent-core`](https://github.com/badlogic/pi-mono) / `pi-ai` / `pi-coding-agent`
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

| 命令                             | 用途                                   |
| -------------------------------- | -------------------------------------- |
| `bun run dev`                    | 启动桌面端开发环境                     |
| `bun run build`                  | 执行 Electron Forge 打包流程           |
| `bun run check`                  | 运行格式、Lint、类型检查与单元测试     |
| `bun run test`                   | 运行单元测试                           |
| `bun run test:coverage`          | 生成测试覆盖率报告                     |
| `bun run typecheck`              | 运行 TypeScript/Vue 类型检查           |
| `bun run shadcn:add <component>` | 使用固定版本的 shadcn-vue CLI 添加组件 |

## 仓库结构

```text
apps/
  desktop/       Electron 桌面端
packages/        预留的共享包目录
docs/            产品、架构与执行环境文档
```

这是一个 Bun monorepo。桌面端渲染进程不会直接访问 Node.js、文件系统或 shell；原生能力应通过 preload 暴露的最小 IPC API 进入主进程。Agent runtime 运行在独立的 Electron utility process 中。

## 参与贡献

直接依赖统一使用精确版本，`bunfig.toml` 已设置 [`install.exact = true`](https://bun.sh/docs/runtime/bunfig#install-exact)。`bun.lock` 必须随依赖变更一起提交；首次安装、CI 和复现构建使用 [`bun install --frozen-lockfile`](https://bun.sh/docs/pm/cli/install)，避免安装时修改锁文件。

新增或升级依赖时，在所属 workspace 执行 `bun add <包名>@<明确版本>`，开发工具加 `--dev`。桌面端工具声明在 `apps/desktop/package.json`；根目录仅保留仓库级工具。`bun run shadcn:add <component>` 使用仓库固定版本的 shadcn-vue CLI，组件生成后的依赖和锁文件变更需要一并检查。

提交改动前请运行：

```bash
bun run check
```

提交遵循 [Conventional Commits](https://www.conventionalcommits.org/) 规范，并保持一个逻辑变更对应一个提交。

## License

Pine is free software licensed under the [GNU General Public License v3.0 only](./LICENSE). See `LICENSE` for the full terms.
