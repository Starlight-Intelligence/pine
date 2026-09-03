// Computes the next Minecraft-style snapshot version ({yy}w{ww}{letter}) and
// writes it into this package's package.json version field.
//
// The letter is inferred from the latest existing snapshot release tag for the
// current ISO week (bump a -> b -> c ...). If the week has rolled over or there
// are no snapshot tags yet, it starts back at "a". This keeps release cadence
// decoupled from any calendar mapping while staying backwards compatible.
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const SNAPSHOT_RE = /^(\d{2})w(\d{2})([a-z])$/;

/** ISO 8601 week-year + week number, rendered as {yy}w{ww}. */
function isoWeekKey(date = new Date()) {
  const target = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const day = target.getUTCDay() || 7; // ISO weekday, Mon=1 .. Sun=7
  target.setUTCDate(target.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((target - yearStart) / 86400000 + 1) / 7);
  const yy = String(target.getUTCFullYear()).slice(-2);
  const ww = String(week).padStart(2, "0");
  return `${yy}w${ww}`;
}

function listSnapshotTags() {
  try {
    return execSync("git tag -l", { encoding: "utf8" })
      .split("\n")
      .map((tag) => tag.trim())
      .filter(Boolean)
      .filter((tag) => SNAPSHOT_RE.test(tag));
  } catch (err) {
    console.error("Failed to list git tags:", err.message);
    throw err;
  }
}

function nextSnapshot(currentKey, tags) {
  // Only tags from the current week are eligible for a letter bump; tags from an
  // earlier week are superseded by the week rollover.
  const sameWeek = tags.filter((tag) => tag.startsWith(currentKey));
  const maxLetter = Math.max(
    0,
    ...sameWeek.map((tag) => tag.charCodeAt(tag.length - 1) - 96),
  );
  if (maxLetter >= 26) {
    throw new Error(
      `Snapshot alphabet exhausted for ${currentKey}: ${sameWeek.join(", ")}`,
    );
  }
  return `${currentKey}${String.fromCharCode(96 + maxLetter + 1)}`;
}

const currentKey = isoWeekKey();
const tags = listSnapshotTags();
const version = nextSnapshot(currentKey, tags);

const pkgPath = join(__dirname, "..", "package.json");

let pkg;
try {
  pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
} catch (err) {
  console.error(`Failed to read package.json at ${pkgPath}:`, err.message);
  throw err;
}
if (pkg.version !== version) {
  pkg.version = version;
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
}

console.log(
  `next snapshot: ${version} (week ${currentKey}, inferred from latest tag)`,
);
