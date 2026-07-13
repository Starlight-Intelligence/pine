export interface WindowTitleParts {
  sessionName?: string;
  workspaceName?: string;
}

export function formatWindowTitle({
  sessionName,
  workspaceName,
}: WindowTitleParts = {}): string {
  const workspaceTitle = workspaceName ? `Pine @ ${workspaceName}` : "Pine";
  return sessionName ? `${sessionName} - ${workspaceTitle}` : workspaceTitle;
}
