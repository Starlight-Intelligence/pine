import { useEventBus } from "@vueuse/core";

const projectFilesChangedKey = Symbol("pine:project-files-changed");

/**
 * Cross-component notification that project files changed outside the file
 * tree (for example through the content-tabs overflow menu). The tree listens
 * and reloads; emitters stay decoupled from the tree implementation.
 */
export function useProjectFileChanges() {
  const bus = useEventBus<undefined>(projectFilesChangedKey);
  return {
    onProjectFilesChanged: (listener: () => void) => bus.on(listener),
    emitProjectFilesChanged: () => bus.emit(undefined),
  };
}
