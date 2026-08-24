import { readdir, realpath } from "node:fs/promises";
import path from "node:path";
import type { PineProjectFolder } from "../shared/projects";
import type { ProjectEntry } from "../shared/projectFiles";

function isWithinRoot(rootPath: string, candidatePath: string): boolean {
  const pathFromRoot = path.relative(rootPath, candidatePath);
  return (
    pathFromRoot === "" ||
    (!pathFromRoot.startsWith(`..${path.sep}`) &&
      pathFromRoot !== ".." &&
      !path.isAbsolute(pathFromRoot))
  );
}

async function resolveProjectDirectory(
  folder: PineProjectFolder,
  relativePath: string,
): Promise<string> {
  if (!folder.isAvailable) throw new Error("Project folder is unavailable.");

  const resolvedRoot = await realpath(folder.path);
  const requestedDirectory = path.resolve(resolvedRoot, relativePath);
  if (!isWithinRoot(resolvedRoot, requestedDirectory)) {
    throw new Error("Directory is outside the selected project folder.");
  }

  const resolvedDirectory = await realpath(requestedDirectory);
  if (!isWithinRoot(resolvedRoot, resolvedDirectory)) {
    throw new Error("Directory resolves outside the selected project folder.");
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

export async function listProjectDirectory(
  folder: PineProjectFolder,
  relativePath: string,
): Promise<ProjectEntry[]> {
  const directoryPath = await resolveProjectDirectory(folder, relativePath);
  const entries = await readdir(directoryPath, { withFileTypes: true });

  return entries
    .filter((entry) => entry.isDirectory() || entry.isFile())
    .map((entry): ProjectEntry => ({
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
