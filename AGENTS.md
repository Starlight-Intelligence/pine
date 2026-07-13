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
