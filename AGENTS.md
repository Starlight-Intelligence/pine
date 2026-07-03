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
