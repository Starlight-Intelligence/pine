export interface ChangelogSection {
  body: string;
  date?: string;
  version: string;
}

const RELEASE_HEADING = /^## \[([^\]]+)\](?: - (\d{4}-\d{2}-\d{2}))?\s*$/;

export function isReleaseVersion(version: string): boolean {
  return /^\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(
    version,
  );
}

export function extractChangelogSection(
  changelog: string,
  version: string,
): ChangelogSection {
  const lines = changelog.replace(/\r\n/g, "\n").split("\n");
  let start = -1;
  let date: string | undefined;

  for (let index = 0; index < lines.length; index += 1) {
    const match = RELEASE_HEADING.exec(lines[index]);
    if (match?.[1] === version) {
      start = index + 1;
      date = match[2];
      break;
    }
  }

  if (start === -1) {
    throw new Error(`CHANGELOG.md has no release section for ${version}`);
  }
  if (date === undefined) {
    throw new Error(
      `CHANGELOG.md section ${version} must include a release date`,
    );
  }

  let end = lines.length;
  for (let index = start; index < lines.length; index += 1) {
    if (RELEASE_HEADING.test(lines[index])) {
      end = index;
      break;
    }
  }

  const body = lines.slice(start, end).join("\n").trim();
  if (body.length === 0) {
    throw new Error(`CHANGELOG.md section ${version} is empty`);
  }

  return { body, date, version };
}
