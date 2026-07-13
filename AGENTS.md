# Project Instructions

## 用户偏好

- 默认使用 Bun 作为包管理器。
- 回复保持简洁、准确，避免 hype。
- 修改项目结构或代码前先说明将要改什么。

## 项目约定

- 这是一个 monorepo，应用放在 `apps/`，共享包放在 `packages/`。
- 桌面端第一版位于 `apps/desktop`。
- 使用 TypeScript 严格模式。
- 测试文件放在 `__tests__/` 目录。
- Electron 渲染进程不直接访问 Node.js、文件系统或 shell；通过 preload 暴露的最小 IPC API 访问主进程能力。
- 项目级 Pine 元数据放在 `.pine/` 目录。
- 应用基础设施和横切能力应在功能开发初期统一规划，避免随着页面推进零散引入依赖；新增包必须有明确职责、稳定边界和验证方式。
- Renderer 的可导航 UI 状态使用 Vue Router，跨视图应用状态使用 Pinia；文件系统和 Electron 原生能力仍只通过 preload IPC 访问。
- 代码默认使用分号、双引号和两个空格缩进，由 ESLint 与 Prettier 共同校验。
- 单元测试使用 Vitest；Vue 组件使用 Vue Test Utils，Pinia store 测试可使用 `@pinia/testing`。测试统一放在相邻模块的 `__tests__/` 目录。
- shadcn-vue 生成的 `src/components/ui/` 与 `src/styles/shadcn-vue.css` 不做全局格式化改写；组件升级继续以 CLI 生成结果为准。
- 提交前运行 `bun run check`，统一执行格式、Lint、类型和单元测试检查；需要覆盖率报告时运行 `bun run test:coverage`。

## shadcn-vue 组件流程

- 默认 UI 基底使用 shadcn-vue 官方 `reka-luma` style，配置在 `apps/desktop/components.json`。
- 标准添加组件命令从仓库根目录运行：

  ```sh
  bun run shadcn:add <component>
  ```

- 不要直接把 shadcn Studio / React shadcn 的 `style: "radix-rhea"` 写进 `components.json`。Studio 来源和映射记录在 `apps/desktop/shadcn-studio.json`。
- 组件添加后保持 shadcn-vue 生成结果，不套用 React shadcn 的 Rhea patch。
- 当 skill、生成代码与当前 shadcn-vue 官方文档或用例存在分歧时，先核对当前官方用例；以官方用例和项目实际需求为准，并记录偏离原因，不为迎合 skill 机械修改官方生成结果。

- 添加或修改组件后运行：

  ```sh
  bun run typecheck
  ```

- 如果 Bun 下载或安装在当前环境里很慢，把需要运行的命令列给用户手动执行。
