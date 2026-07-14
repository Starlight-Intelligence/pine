import { readdir } from "node:fs/promises";
import path from "node:path";
import { PINE_METADATA_DIRECTORY } from "../shared/projects";
import type { WorkspaceEntry } from "../shared/workspaceFiles";

function resolveWorkspaceDirectory(
  rootPath: string,
  relativePath: string,
): string {
  const resolvedRoot = path.resolve(rootPath);
  const resolvedDirectory = path.resolve(resolvedRoot, relativePath);
  const pathFromRoot = path.relative(resolvedRoot, resolvedDirectory);

  if (
    pathFromRoot.startsWith(`..${path.sep}`) ||
    pathFromRoot === ".." ||
    path.isAbsolute(pathFromRoot)
  ) {
    throw new Error("Directory is outside the active workspace.");
  }

  return resolvedDirectory;
}

function toPortableRelativePath(
  parentRelativePath: string,
  name: string,
): string {
  return [parentRelativePath, name]
    .filter(Boolean)
    .join("/")
    .replaceAll(path.sep, "/");
}

export async function listWorkspaceDirectory(
  rootPath: string,
  relativePath: string,
): Promise<WorkspaceEntry[]> {
  const directoryPath = resolveWorkspaceDirectory(rootPath, relativePath);
  const entries = await readdir(directoryPath, { withFileTypes: true });

  return entries
    .filter(
      (entry) =>
        entry.name !== PINE_METADATA_DIRECTORY &&
        (entry.isDirectory() || entry.isFile()),
    )
    .map((entry): WorkspaceEntry => ({
      kind: entry.isDirectory() ? "directory" : "file",
      name: entry.name,
      relativePath: toPortableRelativePath(relativePath, entry.name),
    }))
    .sort((left, right) => {
      if (left.kind !== right.kind) {
        return left.kind === "directory" ? -1 : 1;
      }
      return left.name.localeCompare(right.name, undefined, {
        numeric: true,
        sensitivity: "base",
      });
    });
}
