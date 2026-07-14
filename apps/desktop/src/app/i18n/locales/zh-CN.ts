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
