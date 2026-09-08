import { watch, type FSWatcher } from "node:fs";
import { realpath } from "node:fs/promises";
import path from "node:path";
import type {
  ProjectFolderFileChanges,
  SetWatchedProjectDirectoriesRequest,
  WatchedProjectFolder,
} from "../shared/projectFiles";

function isWithinRoot(rootPath: string, candidatePath: string): boolean {
  const pathFromRoot = path.relative(rootPath, candidatePath);
  return (
    pathFromRoot === "" ||
    (!pathFromRoot.startsWith(`..${path.sep}`) &&
      pathFromRoot !== ".." &&
      !path.isAbsolute(pathFromRoot))
  );
}

interface FolderWatchers {
  rootPath: string;
  /** Absolute directory path -> active watcher. */
  watchers: Map<string, FSWatcher>;
  /** Portable relative paths of directories with pending change events. */
  pending: Set<string>;
  timer: NodeJS.Timeout | null;
}

export type ProjectFilesChangeListener = (
  senderId: number,
  changes: ProjectFolderFileChanges[],
) => void;

export interface ProjectFileWatcherOptions {
  changeDebounceMs?: number;
}

/**
 * Watches the directories the renderer currently shows (project roots plus
 * expanded directories) with non-recursive fs.watch handles and reports
 * debounced change batches per webContents sender. Watching only visible
 * directories keeps the handle count bounded regardless of project size.
 */
export class ProjectFileWatcherRegistry {
  private readonly senders = new Map<number, Map<string, FolderWatchers>>();
  private readonly changeDebounceMs: number;

  constructor(
    private readonly onChange: ProjectFilesChangeListener,
    options: ProjectFileWatcherOptions = {},
  ) {
    this.changeDebounceMs = options.changeDebounceMs ?? 200;
  }

  async setWatchedDirectories(
    senderId: number,
    request: SetWatchedProjectDirectoriesRequest,
  ): Promise<void> {
    const existing = this.senders.get(senderId) ?? new Map();
    const nextKeys = new Set(request.folders.map((folder) => folder.folderId));
    for (const [folderId, state] of existing) {
      if (!nextKeys.has(folderId)) {
        this.closeFolder(state);
        existing.delete(folderId);
      }
    }

    for (const folder of request.folders) {
      const state = existing.get(folder.folderId) ?? {
        rootPath: folder.rootPath,
        watchers: new Map<string, FSWatcher>(),
        pending: new Set<string>(),
        timer: null,
      };
      state.rootPath = folder.rootPath;
      existing.set(folder.folderId, state);
      await this.syncFolder(folder, state);
    }
    this.senders.set(senderId, existing);
  }

  private async syncFolder(
    folder: WatchedProjectFolder,
    state: FolderWatchers,
  ): Promise<void> {
    const resolvedRoot = await realpath(folder.rootPath).catch(() => undefined);
    if (!resolvedRoot) {
      this.closeFolder(state);
      return;
    }

    const wanted = new Map<string, string>();
    for (const relativePath of folder.directories) {
      const resolved = await realpath(
        path.resolve(resolvedRoot, relativePath),
      ).catch(() => undefined);
      if (resolved && isWithinRoot(resolvedRoot, resolved)) {
        wanted.set(resolved, relativePath);
      }
    }

    for (const [absolute, watcher] of state.watchers) {
      if (!wanted.has(absolute)) {
        watcher.close();
        state.watchers.delete(absolute);
      }
    }

    for (const [absolute, relativePath] of wanted) {
      if (state.watchers.has(absolute)) continue;
      try {
        const watcher = watch(absolute, { persistent: false }, () => {
          state.pending.add(relativePath);
          this.scheduleFlush(folder.folderId, state);
        });
        watcher.on("error", () => {
          watcher.close();
          state.watchers.delete(absolute);
          state.pending.add(relativePath);
          this.scheduleFlush(folder.folderId, state);
        });
        state.watchers.set(absolute, watcher);
      } catch {
        // Directory vanished between realpath and watch; the renderer will
        // rebuild the tree on the next change event it does receive.
      }
    }
  }

  private scheduleFlush(folderId: string, state: FolderWatchers): void {
    if (state.timer) return;
    state.timer = setTimeout(() => {
      state.timer = null;
      if (state.pending.size === 0) return;
      const changedDirs = [...state.pending].sort((a, b) => a.localeCompare(b));
      state.pending.clear();
      for (const [senderId, folders] of this.senders) {
        if ([...folders.values()].includes(state)) {
          this.onChange(senderId, [{ folderId, changedDirs }]);
          return;
        }
      }
    }, this.changeDebounceMs);
  }

  disposeSender(senderId: number): void {
    const folders = this.senders.get(senderId);
    if (!folders) return;
    for (const state of folders.values()) this.closeFolder(state);
    this.senders.delete(senderId);
  }

  dispose(): void {
    for (const senderId of [...this.senders.keys()])
      this.disposeSender(senderId);
  }

  private closeFolder(state: FolderWatchers): void {
    if (state.timer) {
      clearTimeout(state.timer);
      state.timer = null;
    }
    for (const watcher of state.watchers.values()) watcher.close();
    state.watchers.clear();
  }
}
