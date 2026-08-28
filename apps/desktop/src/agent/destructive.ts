export interface DestructiveMatch {
  /** Stable identifier of the matched heuristic. */
  name: string;
  /** Human-readable explanation for the reviewer. */
  description: string;
}

interface DestructivePattern {
  name: string;
  description: string;
  regex: RegExp;
}

/**
 * Heuristics for commands that are destructive or irreversible *within* the
 * sandbox's allowed scope. The sandbox cannot catch these (they only touch
 * writable paths), so agent-decides mode escalates matching commands to the
 * model judge before execution.
 */
const PATTERNS: DestructivePattern[] = [
  {
    name: "recursive-force-delete",
    description:
      "Recursively force-deletes files (rm -rf / -fr / -r -f); may destroy untracked or unrelated data.",
    regex: /\brm\s+(?:-{1,2}[a-zA-Z-]+\s+)*-[a-zA-Z]*[rf][a-zA-Z]*\b/,
  },
  {
    name: "git-force-push",
    description:
      "Force-pushes to a remote, which can irreversibly overwrite shared history.",
    regex: /\bgit\s+push\b[^|;&]*(?:--force(?:-with-lease)?|\s-f\b)/,
  },
  {
    name: "git-hard-reset",
    description: "git reset --hard discards uncommitted changes irreversibly.",
    regex: /\bgit\s+reset\s+(?:-[a-zA-Z]+\s+)*--hard\b/,
  },
  {
    name: "git-clean",
    description:
      "git clean with -f/-d/-x deletes untracked (and ignored) files.",
    regex: /\bgit\s+clean\b(?:[^|;&]*\s)-[a-zA-Z]*[fdx]/,
  },
  {
    name: "git-branch-force-delete",
    description: "Force-deletes a git branch regardless of merge state.",
    regex:
      /\bgit\s+(?:branch\s+(?:-[a-zA-Z]*D|--delete\s*--force)|push\s+\S+\s+--delete\b)/,
  },
  {
    name: "drop-database-object",
    description: "Drops a database table/database/schema/index.",
    regex: /\bdrop\s+(?:table|database|schema|index)\b/i,
  },
  {
    name: "truncate-table",
    description: "Truncates a database table.",
    regex: /\btruncate\s+table\b/i,
  },
  {
    name: "pipe-to-shell",
    description:
      "Downloads a script from the network and pipes it straight into a shell.",
    regex: /\b(?:curl|wget)\b[^|;&]*\|\s*(?:sudo\s+)?(?:ba|z)?sh\b/,
  },
  {
    name: "raw-device-write",
    description: "Writes directly to a raw device or builds a filesystem.",
    regex: /\bmkfs(?:\.\w+)?\b|\bdd\b[^|;&]*\bof=\/dev\/(?!null)/,
  },
  {
    name: "package-publish",
    description: "Publishes a package to a public registry.",
    regex: /\b(?:npm|bun|pnpm|yarn)\s+publish\b/,
  },
  {
    name: "broaden-permissions",
    description:
      "Recursively grants world-writable permissions (chmod -R 777).",
    regex: /\bchmod\s+(?:-[a-zA-Z]*R[a-zA-Z]*\s+)?777\b/,
  },
  {
    name: "system-power",
    description: "Shuts down or reboots the machine.",
    regex: /\b(?:shutdown|reboot|halt|poweroff)\b/,
  },
  {
    name: "docker-prune-volumes",
    description:
      "Prunes Docker volumes/system data, deleting persisted container state.",
    regex:
      /\bdocker\s+(?:system|volume)\s+prune\b[^|;&]*(?:-a|--all|--volumes)/,
  },
];

export function matchDestructive(command: string): DestructiveMatch | null {
  for (const pattern of PATTERNS) {
    if (pattern.regex.test(command)) {
      return { name: pattern.name, description: pattern.description };
    }
  }
  return null;
}
