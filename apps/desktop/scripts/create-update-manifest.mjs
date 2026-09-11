import { createHash } from "node:crypto";
import {
  createReadStream,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function sha256(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

const assetsDirectory = required("ASSETS_DIRECTORY");
const version = required("RELEASE_VERSION");
const internalVersion = required("INTERNAL_VERSION");
const publicBaseUrl = required("R2_PUBLIC_BASE_URL").replace(/\/$/, "");
const prefix = process.env.R2_PREFIX ?? "";
const changelog = readFileSync(required("CHANGELOG_FILE"), "utf8").trim();
const files = readdirSync(assetsDirectory).filter((name) =>
  name.endsWith(".dmg"),
);
const assets = {};

for (const arch of ["arm64", "x64"]) {
  const name = files.find((candidate) =>
    candidate.endsWith(`-darwin-${arch}.dmg`),
  );
  if (!name) throw new Error(`Missing darwin-${arch} installer`);
  const filePath = path.join(assetsDirectory, name);
  const objectKey = `${prefix}releases/v${version}/${name}`;
  assets[`darwin-${arch}`] = {
    sha256: await sha256(filePath),
    size: statSync(filePath).size,
    url: `${publicBaseUrl}/${objectKey}`,
  };
}

const manifest = {
  schemaVersion: 1,
  version,
  internalVersion,
  publishedAt: new Date().toISOString(),
  changelog,
  assets,
};
writeFileSync(
  path.join(assetsDirectory, "update.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
);
