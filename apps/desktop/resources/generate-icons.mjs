// Run on macOS: bun apps/desktop/resources/generate-icons.mjs
// icon.png is the supplied artwork, reduced to 1024 × 1024 without cropping.
import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const resources = path.dirname(fileURLToPath(import.meta.url));
const temporary = mkdtempSync(path.join(tmpdir(), "pine-icons-"));
const iconset = path.join(temporary, "Pine.iconset");
mkdirSync(iconset);

function resize(size, output) {
  execFileSync(
    "sips",
    [
      "-z",
      String(size),
      String(size),
      path.join(resources, "icon.png"),
      "--out",
      output,
    ],
    { stdio: "ignore" },
  );
}

try {
  for (const size of [16, 32, 128, 256, 512]) {
    resize(size, path.join(iconset, `icon_${size}x${size}.png`));
    resize(size * 2, path.join(iconset, `icon_${size}x${size}@2x.png`));
  }
  execFileSync("iconutil", [
    "-c",
    "icns",
    iconset,
    "-o",
    path.join(resources, "icon.icns"),
  ]);

  // ICO supports PNG payloads; include each common Windows display size.
  const sizes = [16, 32, 48, 64, 128, 256];
  const images = sizes.map((size) => {
    const output = path.join(temporary, `${size}.png`);
    resize(size, output);
    return readFileSync(output);
  });
  const directory = Buffer.alloc(6 + 16 * sizes.length);
  directory.writeUInt16LE(1, 2);
  directory.writeUInt16LE(sizes.length, 4);
  let offset = directory.length;
  images.forEach((image, index) => {
    const entry = 6 + index * 16;
    directory[entry] = sizes[index] % 256;
    directory[entry + 1] = sizes[index] % 256;
    directory.writeUInt16LE(1, entry + 4);
    directory.writeUInt16LE(32, entry + 6);
    directory.writeUInt32LE(image.length, entry + 8);
    directory.writeUInt32LE(offset, entry + 12);
    offset += image.length;
  });
  writeFileSync(
    path.join(resources, "icon.ico"),
    Buffer.concat([directory, ...images]),
  );
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
