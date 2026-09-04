// Run on macOS: bun apps/desktop/resources/generate-icons.mjs
// Xcode 26+ compiles the native .icon and generates legacy artwork itself.
import { execFileSync } from "node:child_process";
import {
  cpSync,
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
const output = path.join(temporary, "compiled");
mkdirSync(output);

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
  const document = path.join(resources, "icon.icon");
  cpSync(
    path.join(resources, "../src/assets/pine-logo.svg"),
    path.join(document, "Assets/Logo.svg"),
  );
  execFileSync("actool", [
    document,
    "--compile",
    output,
    "--output-format",
    "human-readable-text",
    "--output-partial-info-plist",
    path.join(output, "partial.plist"),
    "--app-icon",
    "icon",
    "--include-all-app-icons",
    "--enable-on-demand-resources",
    "NO",
    "--development-region",
    "en",
    "--target-device",
    "mac",
    "--minimum-deployment-target",
    "11.0",
    "--platform",
    "macosx",
  ]);
  cpSync(path.join(output, "icon.icns"), path.join(resources, "icon.icns"));
  // Apple supplies the legacy mask, padding and highlight. Do not draw a contour
  // or rasterize an unmasked source into the development Dock override.
  execFileSync("sips", [
    "-s",
    "format",
    "png",
    path.join(resources, "icon.icns"),
    "--out",
    path.join(resources, "icon.png"),
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
