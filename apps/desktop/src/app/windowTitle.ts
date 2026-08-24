export interface WindowTitleParts {
  projectName?: string;
  sessionName?: string;
}

export function formatWindowTitle({
  sessionName,
  projectName,
}: WindowTitleParts = {}): string {
  const projectTitle = projectName ? `Pine @ ${projectName}` : "Pine";
  return sessionName ? `${sessionName} - ${projectTitle}` : projectTitle;
}
