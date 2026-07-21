export default {
  welcome: {
    title: "让我们携手把事情做好",
    openFolder: "打开文件夹",
    settings: "设置",
    language: "语言",
    languageChinese: "简体中文",
    languageEnglish: "English",
    appearance: "外观",
    themeSystem: "跟随系统",
    themeLight: "浅色",
    themeDark: "深色",
  },
  sessions: {
    searchTitle: "搜索会话",
    searchDescription: "按标题和会话内容搜索当前工作区",
    searchPlaceholder: "搜索会话内容",
    searchAction: "搜索会话",
    searching: "正在搜索",
    newSession: "新会话",
    current: "当前",
    noSessions: "还没有会话",
    noResults: "没有匹配的会话",
  },
  workspace: {
    preferences: "偏好设置",
    contentTabs: {
      newSession: "新会话",
      sessionNumber: "会话 {number}",
      addTab: "新建会话标签页",
      closeTab: "关闭 {name}",
    },
    composer: {
      label: "会话消息",
      placeholder: "描述任务或提出问题…",
      addContext: "添加上下文",
      send: "发送消息",
      model: "模型",
      reasoningEffort: "推理强度",
      models: {
        lightweight: "轻快响应，适合简单和日常任务",
        balanced: "速度与能力均衡，适合大多数任务",
        advanced: "深入分析，适合复杂和高要求任务",
      },
      approval: {
        askForPermissionLabel: "让我审批",
        askForPermission: "每次工具调用前都请求确认",
        agentDecidesLabel: "帮我决定",
        agentDecides: "由 Agent 判断哪些操作需要确认",
        yoloLabel: "干就完了",
        yolo: "自主执行，仅在出错时通知",
      },
    },
    tabs: {
      files: "文件",
      sessions: "会话",
    },
    files: {
      loading: "正在读取",
      emptyTitle: "文件夹是空的",
      emptyDescription: "此工作目录中还没有文件",
    },
  },
  errors: {
    workspaceOpen: {
      title: "无法打开文件夹",
      description: "请确认该文件夹可访问后重试",
    },
    sessionSearch: {
      title: "无法搜索会话",
      description: "请稍后重试",
    },
    sessionResume: {
      title: "无法打开会话",
      description: "该会话可能已被移动或删除",
    },
    workspaceFiles: {
      title: "无法读取文件",
      description: "请确认工作目录可访问后重试",
    },
  },
} as const;
