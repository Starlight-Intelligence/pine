import { randomUUID } from 'node:crypto';
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  PINE_METADATA_DIRECTORY,
  PINE_PROJECT_METADATA_FILE,
  type PineWorkspaceSummary,
} from '../shared/projects';

const PINE_PROJECT_SCHEMA_VERSION = 1 as const;

interface PineProjectMetadata {
  schemaVersion: typeof PINE_PROJECT_SCHEMA_VERSION;
  id: string;
  createdAt: string;
}

function isFileSystemError(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code;
}

function parseProjectMetadata(contents: string): PineProjectMetadata {
  const metadata: unknown = JSON.parse(contents);

  if (
    typeof metadata !== 'object'
    || metadata === null
    || !('schemaVersion' in metadata)
    || metadata.schemaVersion !== PINE_PROJECT_SCHEMA_VERSION
    || !('id' in metadata)
    || typeof metadata.id !== 'string'
    || metadata.id.length === 0
    || !('createdAt' in metadata)
    || typeof metadata.createdAt !== 'string'
    || Number.isNaN(Date.parse(metadata.createdAt))
  ) {
    throw new Error('The Pine project metadata is invalid or unsupported.');
  }

  return {
    schemaVersion: metadata.schemaVersion,
    id: metadata.id,
    createdAt: metadata.createdAt,
  };
}

async function readProjectMetadata(metadataPath: string): Promise<PineProjectMetadata> {
  return parseProjectMetadata(await readFile(metadataPath, 'utf8'));
}

async function loadOrCreateProjectMetadata(rootPath: string): Promise<PineProjectMetadata> {
  const metadataDirectory = path.join(rootPath, PINE_METADATA_DIRECTORY);
  const metadataPath = path.join(metadataDirectory, PINE_PROJECT_METADATA_FILE);

  await mkdir(metadataDirectory, { recursive: true });

  try {
    return await readProjectMetadata(metadataPath);
  } catch (error) {
    if (!isFileSystemError(error, 'ENOENT')) throw error;
  }

  const metadata: PineProjectMetadata = {
    schemaVersion: PINE_PROJECT_SCHEMA_VERSION,
    id: randomUUID(),
    createdAt: new Date().toISOString(),
  };

  try {
    await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
    });
    return metadata;
  } catch (error) {
    if (!isFileSystemError(error, 'EEXIST')) throw error;
    return readProjectMetadata(metadataPath);
  }
}

export async function openWorkspace(rootPath: string): Promise<PineWorkspaceSummary> {
  const resolvedRootPath = await realpath(rootPath);
  const metadata = await loadOrCreateProjectMetadata(resolvedRootPath);

  return {
    id: metadata.id,
    name: path.basename(resolvedRootPath),
    rootPath: resolvedRootPath,
  };
}
